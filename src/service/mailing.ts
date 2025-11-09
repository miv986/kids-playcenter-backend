import { Resend } from "resend";
import dotenv from "dotenv";
import { getEmailTemplate, EmailTemplateData } from "./emailTemplates";

dotenv.config();

const resend = new Resend(process.env.RESEND_API!);

// Configuración del remitente (desde .env)
const FROM_EMAIL = process.env.FROM_EMAIL;
const FROM_NAME = process.env.FROM_NAME;

/**
 * Envía un email usando la plantilla base
 */
export async function sendTemplatedEmail(
    toEmail: string,
    subject: string,
    templateData: EmailTemplateData
) {
    if (!FROM_EMAIL) {
        throw new Error("FROM_EMAIL no está configurado en las variables de entorno");
    }
    
    try {
        const html = getEmailTemplate(templateData);
        
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            to: [toEmail],
            subject,
            html,
        });

        if (error) {
            console.error("Error enviando email:", error);
            throw error;
        }

        return data;
    } catch (error) {
        console.error("Error en sendTemplatedEmail:", error);
        throw error;
    }
}

/**
 * Función legacy para compatibilidad (mantener si hay código que la usa)
 */
export async function sendEmail(toEmail: string, subject: string, html: string) {
    return sendTemplatedEmail(toEmail, subject, {
        title: subject,
        content: html
    });
}
