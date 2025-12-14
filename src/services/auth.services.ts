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
    if (!email && !phone && deviceId) {
        const exist = await prisma.user.findUnique({
            where: {deviceId: deviceId as string},
        });
        if (exist) {
            return exist;
        }
    }

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

    const wantsDeviceLogin = !!deviceId && !rawPassword;

    let user;

    if (wantsDeviceLogin) {
        user = await prisma.user.findUnique({
            where: {deviceId: deviceId as string},
        });
        if (!user) {
            throw new Error('Identifiants invalides');
        }
    } else {
        if (!rawPassword || (!email && !phone)) {
            throw new Error('Email ou téléphone + mot de passe requis pour la connexion');
        }

        user = await prisma.user.findFirst({
            where: {
                OR: [
                    email ? {email} : undefined,
                    phone ? {phone} : undefined,
                ].filter(Boolean) as any,
            },
        });

        if (!user || !user.password) {
            throw new Error('Identifiants invalides');
        }

        const valid = await bcrypt.compare(rawPassword, user.password);
        if (!valid) {
            throw new Error('Identifiants invalides');
        }
    }

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

    await prisma.user.update({
        where: {id: user.id},
        data: {
            refreshToken: refresh_token,
            lastLogin: new Date()
        },
    });

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

export const refresh = async (refreshToken: string): Promise<{ access_token: string; user: User; refresh_token: string }> => {
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

    const newAccessToken = jwt.sign(
        {userId: user.id, userRole: user.role.id, isAdmin: user.isAdmin},
        process.env.JWT_SECRET as string,
        {
            expiresIn: ACCESS_TOKEN_EXPIRY,
        },
    );

    const newRefreshToken = jwt.sign(
        {userId: user.id, userRole: user.role.id, isAdmin: user.isAdmin},
        process.env.JWT_REFRESH_SECRET as string,
        {
            expiresIn: REFRESH_TOKEN_EXPIRY,
        },
    );

    await prisma.user.update({
        where: {id: user.id},
        data: {
            refreshToken: newRefreshToken,
            lastLogin: new Date(),
        },
    });

    return {access_token: newAccessToken, user, refresh_token: newRefreshToken};

}
