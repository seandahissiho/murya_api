import {body} from "express-validator";
import {NextFunction, Request, Response} from "express";
import jwt from "jsonwebtoken";
import {sendResponse} from "../utils/helpers";
import {prisma} from "../config/db";
import {permissions_action, permissions_entity} from "@prisma/client";

export const validateLogin = [
    body("email").isEmail().withMessage("Format d'email invalide"),
    body("password")
        .isLength({min: 6})
        // .withMessage("Password must be at least 6 characters long"),
        .withMessage("Le mot de passe doit comporter au moins 6 caractères"),
];

export const validateRefresh = [
    body("refresh_token").notEmpty().withMessage("Le token de rafraîchissement est requis"),
];
