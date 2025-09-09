import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';


const prisma = new PrismaClient();

interface JwtPayload {
    userId: number;
    role: 'USER' | 'ADMIN';
}

export const authenticateUser = async (req: any, res: any, next: any) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        // Verificamos el token
        const secret = process.env.JWT_SECRET!;
        let payload: JwtPayload;

        try {
            payload = jwt.verify(token, secret) as JwtPayload;
        } catch (err) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Buscamos el usuario en la base de datos con Prisma
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
        });

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        if (!user.isEmailVerified) {
            return res.status(401).json({ error: "Usuario no verificado!" })
        }
        if (user.role !== "USER" && user.role !== "ADMIN") {
            return res.status(401).json({ error: 'Solo un tutor puede añadir hijos' });

        }

        // Adjuntamos el usuario al request
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Authentication failed' });
    }
};