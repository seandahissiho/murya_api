import { Request, Response } from 'express';
import {detectLanguage} from "../middlewares/i18n";

export const getHealth = async (req: Request, res: Response) => {
    await detectLanguage(req);
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
};
