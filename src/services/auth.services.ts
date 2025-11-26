import {User} from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {prisma} from "../config/db";

const SALT_ROUNDS = 10;

const ACCESS_TOKEN_EXPIRY = "8h";
const REFRESH_TOKEN_EXPIRY = "14d";

async function getDefaultRole() {
    const role = await prisma.role.findFirst({
        where: {name: "UNIDENTIFIED"},
    });
    if (role) {
        return role.id;
    }
    throw new Error('Default role not found');
}


// Inscription : création de l'utilisateur avec hachage du mot de passe
export const register = async (
    email?: string,
    phone?: string,
    deviceId?: string,
    rawPassword?: string,
): Promise<User> => {
    const hash = rawPassword ? await bcrypt.hash(rawPassword, SALT_ROUNDS) : null;
    return prisma.user.create({
        data: {
            // firstname,
            // lastname,
            email,
            phone,
            deviceId,
            password: hash,
            // birthDate,
            isAdmin: false, // Par défaut, l'utilisateur n'est pas admin
            isActive: true, // Par défaut, l'utilisateur n'est pas actif
            lastLogin: null, // Pas de date de dernier login à l'inscription
            avatarUrl: null, // Pas d'avatar par défaut
            roleId: await getDefaultRole(), // Récupérer le rôle par défaut
        }
    });
};

// Connexion : validation, update lastLogin et émission d'un JWT
export const login = async (
    email?: string,
    phone?: string,
    deviceId?: string,
    rawPassword?: string,
): Promise<{ access_token: string; refresh_token: string }> => {
    if (!email && !phone && !deviceId) {
        throw new Error('Email, téléphone ou deviceId requis pour la connexion');
    }
    let whereClause: any = {};
    if (email) whereClause.email = email;
    if (phone) whereClause.phone = phone;
    if (deviceId) whereClause.deviceId = deviceId;

    let user = await prisma.user.findUnique({
        where: whereClause
    });

    if (!user) throw new Error('Identifiants invalides');
    const valid = await bcrypt.compare(rawPassword ?? '', user.password ?? '?$Sm@S@M6QQ$xDp?hdYSC!!?sh633o7SgHEz9oG');
    if (!valid && rawPassword) throw new Error('Identifiants invalides');


    // Generate Access Token
    const access_token = jwt.sign(
        {userId: user.id, userRole: user.roleId, isAdmin: user.isAdmin},
        process.env.JWT_SECRET as string,
        {
            expiresIn: ACCESS_TOKEN_EXPIRY,
        },
    );

    if (!access_token) {
        throw new Error('Failed to generate access token');
    }

    // Generate Refresh Token
    const refresh_token = jwt.sign(
        {userId: user.id, userRole: user.roleId, isAdmin: user.isAdmin},
        process.env.JWT_REFRESH_SECRET as string,
        {
            expiresIn: REFRESH_TOKEN_EXPIRY,
        },
    );

    if (!refresh_token) {
        throw new Error('Failed to generate refresh token');
    }

    // Store Refresh Token in the Database
    // Mettre à jour la date du dernier login
    await prisma.user.update({
        where: {id: user.id},
        data: {
            refreshToken: refresh_token,
            lastLogin: new Date() // Mettre à jour la date du dernier login
        },
    });

    // 2) Once login is successful, trigger daily quiz creation
    // quizAssignmentService.assignQuizzesForUserOnLogin(user.id).then(r => {
    //     // Quizzes assigned
    //     console.log(`Daily quizzes assigned for user ${user.id} on login.`);
    // });

    return {access_token, refresh_token}
};

// Récupération des informations de l'utilisateur
export const retrieve = async (userId: string): Promise<User | null> => {
    const user = await prisma.user.findUnique({
        where: {id: userId},
        include: {
            role: true,
        },
    });

    if (!user) {
        throw new Error('Utilisateur non trouvé');
    }

    return user;
}

async function checkEmailExistsAndIsActive(param: any) {
    return true;
}

export const refresh = async (refreshToken: string): Promise<{ access_token: string; user: User }> => {
    const payload: any = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET as string,
    );

    const user = await prisma.user.findUnique({
        where: {id: payload.userId},
        include: {
            role: true,
        }
    });

    if (!user || user.refreshToken !== refreshToken) {
        throw new Error('Token de rafraîchissement invalide');
    }

    const isValid = await checkEmailExistsAndIsActive(user?.email || "");
    if (!isValid) {
        throw new Error('Votre compte n\'est pas activé');
    }

    // Generate a new Access Token
    const newAccessToken = jwt.sign(
        {userId: user.id, userRole: user.role.id, isAdmin: user.isAdmin},
        process.env.JWT_SECRET as string,
        {
            expiresIn: ACCESS_TOKEN_EXPIRY,
        },
    );

    if (!newAccessToken) {
        throw new Error('Failed to generate new access token');
    }

    // quizAssignmentService.assignQuizzesForUserOnLogin(user.id).then(r => {
    //     // Quizzes assigned
    //     console.log(`Daily quizzes assigned for user ${user.id} on login.`);
    // });

    return {access_token: newAccessToken, user};

}