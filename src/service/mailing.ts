import express from "express";
import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(express.json());

const resend = new Resend(process.env.RESEND_API!);


export async function sendEmail(toEmail: string, subject: string, html: string) {
    try {
        const { data, error } = await resend.emails.send({
            from: "Acme <onboarding@resend.dev>",
            to: [toEmail],
            subject,
            html:
                `
                <h1>Cabecera estandar</h1>
        ${html}
        <h1>Footer estandar</h1>
            `
            ,
        });
        console.error(error)
        return data;
    } catch (error) {
        console.error(error)
    }
}
