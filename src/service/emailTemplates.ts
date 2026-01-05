// ✅ Importar funciones de timezone unificado
import { formatTimeForEmail, formatDateForEmail } from '../utils/timezone';

export interface EmailTemplateData {
    title: string;
    greeting?: string; // "Hola [nombre]"
    content: string; // HTML del contenido principal
    details?: Array<{ label: string; value: string }>; // Detalles de reserva
    actionButton?: { text: string; url: string; color?: string };
    footerMessage?: string;
}

/**
 * Formatea una fecha a hora local (HH:MM) en zona horaria de Madrid
 * ✅ ACTUALIZADO: Usa el sistema de timezone unificado
 * 
 * Nota: Los emails HTML estáticos no pueden detectar la zona horaria del destinatario
 * automáticamente (JavaScript está bloqueado en la mayoría de clientes de email).
 * Esta es la práctica estándar usada por servicios como restaurantes, eventos, etc.
 */
function formatTime(date: Date): string {
    return formatTimeForEmail(date);
}

/**
 * Formatea una fecha a formato de fecha local sin mostrar zona horaria
 * ✅ ACTUALIZADO: Usa el sistema de timezone unificado
 */
function formatDate(date: Date): string {
    return formatDateForEmail(date, 'es');
}

export function getEmailTemplate(data: EmailTemplateData): string {
    // Variables de entorno (sin valores por defecto)
    const frontendUrl = process.env.FRONTEND_URL || process.env.WEBSITE_URL;
    const logoUrl = process.env.EMAIL_LOGO_URL || (frontendUrl ? `${frontendUrl}/logo.png` : undefined);
    const companyName = process.env.COMPANY_NAME || "Somriures & Colors";
    const companyTagline = process.env.COMPANY_TAGLINE || "Diversión y aprendizaje";
    const companyEmail = process.env.COMPANY_EMAIL;
    const websiteUrl = process.env.WEBSITE_URL;
    const instagramUrl = process.env.INSTAGRAM_URL;
    const whatsappUrl = process.env.WHATSAPP_URL;

    // Construir sección de detalles si existe
    const detailsSection = data.details && data.details.length > 0 ? `
        <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #1f2937; font-size: 18px; font-weight: 600;">Detalles</h3>
            <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; margin-top: 15px; border: 1px solid #e5e7eb;">
                ${data.details.map(detail => `
                    <p style="margin: 10px 0; font-size: 14px; color: #374151; line-height: 1.6;">
                        <strong style="color: #1f2937;">${detail.label}:</strong> <span style="color: #6b7280;">${detail.value}</span>
                    </p>
                `).join('')}
            </div>
        </div>
    ` : '';

    // Construir botón de acción si existe
    const actionButton = data.actionButton ? `
        <div style="text-align: center; margin: 30px 0;">
            <a href="${data.actionButton.url}" 
               style="display: inline-block; background: ${data.actionButton.color || '#2563eb'}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                ${data.actionButton.text}
            </a>
        </div>
    ` : '';

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; background-color: #f9fafb;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f9fafb;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-collapse: collapse;">
                    <!-- Header con Logo -->
                    <tr>
                        <td style="padding: 40px 30px 30px; text-align: center; background-color: #ffffff; border-radius: 12px 12px 0 0; border-bottom: 2px solid #e5e7eb;">
                            ${logoUrl ? `<img src="${logoUrl}" alt="${companyName}" style="max-width: 200px; height: auto; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;" />` : ''}
                            ${companyTagline ? `<p style="color: #6b7280; margin: 10px 0 0 0; font-size: 14px; font-style: italic;">${companyTagline}</p>` : ''}
                        </td>
                    </tr>
                    
                    <!-- Contenido Principal -->
                    <tr>
                        <td style="padding: 30px;">
                            <h2 style="color: #1f2937; margin-top: 0; font-size: 24px; font-weight: 600;">${data.title}</h2>
                            
                            ${data.greeting ? `<p style="color: #374151; font-size: 16px; line-height: 1.6;">${data.greeting},</p>` : ''}
                            
                            <div style="color: #374151; font-size: 16px; line-height: 1.6;">
                                ${data.content}
                            </div>
                            
                            ${detailsSection}
                            
                            ${actionButton}
                            
                            ${data.footerMessage ? `<p style="color: #6b7280; font-size: 14px; margin-top: 25px;">${data.footerMessage}</p>` : ''}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
                            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="text-align: center; padding-bottom: 20px;">
                                        <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px 0;">
                                            <strong>${companyName}</strong>
                                        </p>
                                        ${companyEmail ? `<p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">Email: <a href="mailto:${companyEmail}" style="color: #2563eb; text-decoration: none;">${companyEmail}</a></p>` : ''}
                                        ${websiteUrl ? `<p style="color: #9ca3af; font-size: 12px; margin: 5px 0;">Web: <a href="${websiteUrl}" style="color: #2563eb; text-decoration: none;">${websiteUrl}</a></p>` : ''}
                                        ${(instagramUrl || whatsappUrl) ? `
                                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                                            ${instagramUrl ? `
                                            <div style="margin-bottom: 20px;">
                                                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0; text-align: center;">Síguenos en:</p>
                                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                                    <tr>
                                                        <td style="text-align: center;">
                                                            <a href="${instagramUrl}" target="_blank" style="display: inline-block; text-decoration: none; background-color: #E4405F; padding: 10px; border-radius: 50%; width: 40px; height: 40px; box-sizing: border-box;">
                                                                <img src="https://cdn.simpleicons.org/instagram/ffffff" alt="Instagram" width="20" height="20" style="display: block; margin: 0 auto; width: 20px; height: 20px;" />
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </div>
                                            ` : ''}
                                            ${whatsappUrl ? `
                                            <div style="margin-top: ${instagramUrl ? '20' : '0'}px; padding-top: ${instagramUrl ? '20' : '0'}px; border-top: ${instagramUrl ? '1px solid #e5e7eb' : 'none'};">
                                                <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0; text-align: center;">Contacta con nosotros para cualquier duda:</p>
                                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                                    <tr>
                                                        <td style="text-align: center;">
                                                            <a href="${whatsappUrl}" target="_blank" style="display: inline-block; text-decoration: none; background-color: #25D366; padding: 10px; border-radius: 50%; width: 40px; height: 40px; box-sizing: border-box;">
                                                                <img src="https://cdn.simpleicons.org/whatsapp/ffffff" alt="WhatsApp" width="20" height="20" style="display: block; margin: 0 auto; width: 20px; height: 20px;" />
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </div>
                                            ` : ''}
                                        </div>
                                        ` : ''}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                                        <p style="color: #9ca3af; font-size: 11px; margin: 0;">
                                            Este es un email automático, por favor no respondas a este mensaje.<br>
                                            © ${new Date().getFullYear()} ${companyName}. Todos los derechos reservados.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

// ============================================
// PLANTILLAS ESPECÍFICAS
// ============================================

/**
 * Email de verificación de cuenta
 */
export function getVerificationEmail(name: string, verifyLink: string): EmailTemplateData {
    return {
        title: "Verifica tu correo electrónico",
        greeting: `Hola ${name}`,
        content: `
            <p>Gracias por registrarte en <strong>Somriures & Colors</strong>.</p>
            <p>Para completar tu registro, por favor verifica tu dirección de correo electrónico haciendo clic en el botón de abajo:</p>
        `,
        actionButton: {
            text: "Verificar Email",
            url: verifyLink,
            color: "#2563eb"
        },
        footerMessage: "Si no creaste esta cuenta, puedes ignorar este email."
    };
}

/**
 * Email de recuperación de contraseña
 */
export function getPasswordResetEmail(name: string, resetLink: string): EmailTemplateData {
    return {
        title: "Recuperación de contraseña",
        greeting: `Hola ${name}`,
        content: `
            <p>Has solicitado recuperar tu contraseña en <strong>Somriures & Colors</strong>.</p>
            <p>Haz clic en el botón de abajo para restablecer tu contraseña. Este enlace expirará en 1 hora.</p>
        `,
        actionButton: {
            text: "Restablecer Contraseña",
            url: resetLink,
            color: "#2563eb"
        },
        footerMessage: "Si no solicitaste este cambio, puedes ignorar este email. Tu contraseña no será modificada."
    };
}

/**
 * Email de confirmación de reserva de cumpleaños creada (pendiente de confirmación)
 */
export function getBirthdayBookingCreatedEmail(
    guestName: string,
    booking: {
        id: number;
        date: Date;
        startTime: Date;
        endTime: Date;
        packageType?: string;
        number_of_kids: number;
        contact_number: string;
    }
): EmailTemplateData {
    const packageNames: Record<string, string> = {
        'ALEGRIA': 'Pack Alegría',
        'FIESTA': 'Pack Fiesta',
        'ESPECIAL': 'Pack Especial'
    };

    const details = [
        { label: "Fecha", value: formatDate(booking.date) },
        { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
        { label: "Número de niños", value: booking.number_of_kids.toString() },
        { label: "Teléfono de contacto", value: booking.contact_number },
        { label: "Estado", value: "Pendiente de confirmación" }
    ];

    if (booking.packageType) {
        details.splice(2, 0, { label: "Pack", value: packageNames[booking.packageType] || booking.packageType });
    }

    return {
        title: "Reserva de cumpleaños recibida",
        greeting: `Hola ${guestName}`,
        content: `
            <p>¡Gracias por tu reserva! Hemos recibido tu solicitud de reserva para la fiesta de cumpleaños.</p>
            <p><strong>Tu reserva está pendiente de confirmación.</strong> Te notificaremos por email una vez que nuestro equipo la haya revisado y confirmado.</p>
        `,
        details,
        footerMessage: "Recibirás un email de confirmación una vez que tu reserva sea aprobada por nuestro equipo."
    };
}

/**
 * Email de confirmación de reserva de cumpleaños (cuando admin confirma)
 */
export function getBirthdayBookingConfirmedEmail(
    guestName: string,
    booking: {
        id: number;
        date: Date;
        startTime: Date;
        endTime: Date;
        packageType?: string;
        number_of_kids: number;
        contact_number: string;
    }
): EmailTemplateData {
    const packageNames: Record<string, string> = {
        'ALEGRIA': 'Pack Alegría',
        'FIESTA': 'Pack Fiesta',
        'ESPECIAL': 'Pack Especial'
    };

    const details = [
        { label: "Fecha", value: formatDate(booking.date) },
        { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
        { label: "Número de niños", value: booking.number_of_kids.toString() },
        { label: "Teléfono de contacto", value: booking.contact_number },
        { label: "Estado", value: "Confirmada" }
    ];

    if (booking.packageType) {
        details.splice(2, 0, { label: "Pack", value: packageNames[booking.packageType] || booking.packageType });
    }

    return {
        title: "¡Tu reserva de cumpleaños ha sido confirmada!",
        greeting: `Hola ${guestName}`,
        content: `
            <p>¡Excelentes noticias! Tu reserva de cumpleaños ha sido <strong>confirmada</strong> por nuestro equipo.</p>
            <p>Estamos emocionados de celebrar contigo. A continuación encontrarás todos los detalles de tu reserva:</p>
        `,
        details,
        footerMessage: "Si tienes alguna pregunta o necesitas modificar tu reserva, no dudes en contactarnos. Recuerda que debes pasar en los próximos 3 días a dejar una señal de pago para confirmar tu reserva."
    };
}

/**
 * Email de notificación de modificación de reserva de cumpleaños
 */
export function getBirthdayBookingModifiedEmail(
    guestName: string,
    booking: {
        id: number;
        date: Date;
        startTime: Date;
        endTime: Date;
        packageType?: string;
        number_of_kids: number;
        contact_number: string;
        status?: string;
    }
): EmailTemplateData {
    const packageNames: Record<string, string> = {
        'ALEGRIA': 'Pack Alegría',
        'FIESTA': 'Pack Fiesta',
        'ESPECIAL': 'Pack Especial'
    };

    const details = [
        { label: "Fecha", value: formatDate(booking.date) },
        { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
        { label: "Número de niños", value: booking.number_of_kids.toString() },
        { label: "Teléfono de contacto", value: booking.contact_number }
    ];

    if (booking.packageType) {
        details.splice(2, 0, { label: "Pack", value: packageNames[booking.packageType] || booking.packageType });
    }

    if (booking.status) {
        details.push({ label: "Estado", value: booking.status });
    }

    return {
        title: "Reserva de cumpleaños modificada",
        greeting: `Hola ${guestName}`,
        content: `
            <p>Te informamos que tu reserva de cumpleaños ha sido <strong>modificada</strong>.</p>
            <p>A continuación encontrarás los <strong>nuevos detalles actualizados</strong> de tu reserva:</p>
        `,
        details,
        footerMessage: "Si tienes alguna pregunta sobre los cambios realizados o necesitas hacer alguna modificación adicional, no dudes en contactarnos."
    };
}

/**
 * Email de confirmación de reserva de ludoteca
 */
export function getDaycareBookingConfirmedEmail(
    userName: string,
    booking: {
        id: number;
        startTime: Date;
        endTime: Date;
        children: Array<{ name: string; surname: string }>;
        status: string;
    }
): EmailTemplateData {
    const childrenNames = booking.children.map(c => `${c.name} ${c.surname}`).join(', ');

    return {
        title: "Reserva de ludoteca confirmada",
        greeting: `Hola ${userName}`,
        content: `
            <p>Tu reserva de ludoteca ha sido <strong>confirmada</strong> exitosamente.</p>
            <p>Aquí tienes los detalles de tu reserva:</p>
        `,
        details: [
            { label: "Fecha", value: formatDate(booking.startTime) },
            { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
            { label: "Niños", value: childrenNames },
            { label: "Estado", value: "Confirmada" }
        ],
        footerMessage: "¡Esperamos verte pronto! Si necesitas modificar o cancelar tu reserva, puedes hacerlo desde tu panel de usuario."
    };
}

/**
 * Email de notificación de cambio de estado de reserva de ludoteca
 */
export function getDaycareBookingStatusChangedEmail(
    userName: string,
    booking: {
        id: number;
        startTime: Date;
        endTime: Date;
        children: Array<{ name: string; surname: string }>;
        status: string;
    },
    previousStatus: string
): EmailTemplateData {
    const statusMessages: Record<string, { title: string; message: string; color: string }> = {
        'CONFIRMED': {
            title: "Reserva confirmada",
            message: "Tu reserva ha sido confirmada.",
            color: "#10b981"
        },
        'CANCELLED': {
            title: "Reserva cancelada",
            message: "Tu reserva ha sido cancelada.",
            color: "#ef4444"
        },
        'PENDING': {
            title: "Reserva pendiente",
            message: "El estado de tu reserva ha cambiado a pendiente.",
            color: "#f59e0b"
        },
        'CLOSED': {
            title: "Reserva cerrada",
            message: "Tu reserva ha sido cerrada automáticamente al haber finalizado.",
            color: "#6b7280"
        }
    };

    const statusInfo = statusMessages[booking.status] || {
        title: "Estado actualizado",
        message: `El estado de tu reserva ha cambiado de ${previousStatus} a ${booking.status}.`,
        color: "#2563eb"
    };

    const childrenNames = booking.children.map(c => `${c.name} ${c.surname}`).join(', ');

    return {
        title: statusInfo.title,
        greeting: `Hola ${userName}`,
        content: `
            <p>${statusInfo.message}</p>
            <p>Detalles de la reserva:</p>
        `,
        details: [
            { label: "Fecha", value: formatDate(booking.startTime) },
            { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
            { label: "Niños", value: childrenNames },
            { label: "Estado", value: booking.status }
        ],
        footerMessage: booking.status === 'CANCELLED'
            ? "Si cancelaste esta reserva por error, puedes crear una nueva desde tu panel de usuario."
            : "Si tienes alguna pregunta, no dudes en contactarnos."
    };
}

/**
 * Email de reserva de cumpleaños cancelada
 */
export function getBirthdayBookingCancelledEmail(
    guestName: string,
    booking: {
        id: number;
        date: Date;
        startTime: Date;
        endTime: Date;
        number_of_kids: number;
    }
): EmailTemplateData {
    return {
        title: "Reserva de cumpleaños cancelada",
        greeting: `Hola ${guestName}`,
        content: `
            <p>Te informamos que tu reserva de cumpleaños ha sido <strong>cancelada</strong>.</p>
            <p>Detalles de la reserva cancelada:</p>
            <p><strong>Si deseas realizar una nueva reserva, deberás empezar de nuevo</strong> desde nuestro sitio web.</p>
        `,
        details: [
            { label: "Fecha", value: formatDate(booking.date) },
            { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
            { label: "Niños", value: booking.number_of_kids.toString() },
            { label: "Estado", value: "Cancelada" }
        ],
        footerMessage: "Si necesitas hacer una nueva reserva, puedes hacerlo desde nuestro sitio web. Deberás completar todo el proceso de reserva nuevamente."
    };
}

/**
 * Email de reserva de cumpleaños cancelada sin slot (con información guardada)
 */
export function getBirthdayBookingCancelledEmailWithoutSlot(
    guestName: string,
    bookingId: number,
    slotInfo: {
        date: Date;
        startTime: Date;
        endTime: Date;
        name: string;
        number_of_kids: number;
        contact_number: string;
    }
): EmailTemplateData {
    return {
        title: "Reserva de cumpleaños cancelada",
        greeting: `Hola ${slotInfo.name}`,
        content: `
            <p>Te informamos que tu reserva de cumpleaños <strong>#${bookingId}</strong> ha sido <strong>cancelada</strong>.</p>
            <p>Detalles de la reserva cancelada:</p>
            <p>Si deseas realizar una nueva reserva, deberás <strong>empezar de nuevo</strong> desde nuestro sitio web.</p>
        `,
        details: [
            { label: "ID de reserva", value: `#${bookingId}` },
            { label: "Fecha original", value: formatDate(slotInfo.date) },
            { label: "Horario original", value: `${formatTime(slotInfo.startTime)} - ${formatTime(slotInfo.endTime)}` },
            { label: "Nombre", value: slotInfo.name },
            { label: "Niños", value: slotInfo.number_of_kids.toString() },
            { label: "Contacto", value: slotInfo.contact_number },
            { label: "Estado", value: "Cancelada" }
        ],
        footerMessage: "Si necesitas hacer una nueva reserva, puedes hacerlo desde nuestro sitio web. Deberás completar todo el proceso de reserva nuevamente."
    };
}

/**
 * Email de reserva de cumpleaños cancelada (caso extremo sin información)
 */
export function getBirthdayBookingCancelledEmailMinimal(
    guestName: string,
    bookingId: number
): EmailTemplateData {
    return {
        title: "Reserva de cumpleaños cancelada",
        greeting: `Hola ${guestName}`,
        content: `
            <p>Te informamos que tu reserva de cumpleaños <strong>#${bookingId}</strong> ha sido <strong>cancelada</strong>.</p>
            <p>Si deseas realizar una nueva reserva, deberás <strong>empezar de nuevo</strong> desde nuestro sitio web.</p>
        `,
        details: [
            { label: "ID de reserva", value: `#${bookingId}` },
            { label: "Estado", value: "Cancelada" }
        ],
        footerMessage: "Si necesitas hacer una nueva reserva, puedes hacerlo desde nuestro sitio web. Deberás completar todo el proceso de reserva nuevamente."
    };
}

/**
 * Email de confirmación de reserva de visita/tutoría creada
 */
export function getMeetingBookingCreatedEmail(
    guestEmail: string,
    guestName: string,
    booking: {
        id: number;
        date: Date;
        startTime: Date;
        endTime: Date;
        phone?: string | null;
        comments?: string | null;
    }
): EmailTemplateData {
    const details = [
        { label: "Fecha", value: formatDate(booking.date) },
        { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
        { label: "Estado", value: "Reserva confirmada" },
        { label: "Correo electrónico", value: guestEmail }
    ];

    if (booking.phone) {
        details.push({ label: "Teléfono de contacto", value: booking.phone });
    }

    if (booking.comments) {
        details.push({ label: "Comentarios", value: booking.comments });
    }

    return {
        title: "Reserva de visita/tutoría recibida",
        greeting: `Hola ${guestName}`,
        content: `
            <p>¡Gracias por tu reserva!</p>
            <p>Tu reserva ha sido <strong>confirmada</strong>.</p>
        `,
        details,
        footerMessage: "¡Esperamos verte pronto! Si necesitas modificar o cancelar tu reserva, ponte en contacto con nosotros."
    };
}

/**
 * Email de notificación de modificación de reserva de visita/tutoría
 */
export function getMeetingBookingModifiedEmail(
    guestEmail: string,
    guestName: string,
    booking: {
        id: number;
        date: Date;
        startTime: Date;
        endTime: Date;
        phone?: string | null;
        comments?: string | null;
        status?: string;
    }
): EmailTemplateData {
    const details = [
        { label: "Fecha", value: formatDate(booking.date) },
        { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
        { label: "Correo electrónico", value: guestEmail }
    ];

    if (booking.phone) {
        details.push({ label: "Teléfono de contacto", value: booking.phone });
    }

    if (booking.comments) {
        details.push({ label: "Comentarios", value: booking.comments });
    }

    if (booking.status) {
        details.push({ label: "Estado", value: booking.status });
    }

    return {
        title: "Reserva de visita/tutoría modificada",
        greeting: `Hola ${guestName}`,
        content: `
            <p>Te informamos que tu reserva de visita/tutoría ha sido <strong>modificada</strong>.</p>
            <p>A continuación encontrarás los <strong>nuevos detalles actualizados</strong> de tu reserva:</p>
        `,
        details,
        footerMessage: "Si tienes alguna pregunta sobre los cambios realizados o necesitas hacer alguna modificación adicional, no dudes en contactarnos."
    };
}

/**
 * Email de reserva de visita/tutoría cancelada
 */
export function getMeetingBookingCancelledEmail(
    guestEmail: string,
    guestName: string,
    booking: {
        id: number;
        date: Date;
        startTime: Date;
        endTime: Date;
        phone?: string | null;
        comments?: string | null;
    }
): EmailTemplateData {
    const details = [
        { label: "Fecha", value: formatDate(booking.date) },
        { label: "Horario", value: `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}` },
        { label: "Estado", value: "Cancelada" },
        { label: "Correo electrónico", value: guestEmail }
    ];

    if (booking.phone) {
        details.push({ label: "Teléfono de contacto", value: booking.phone });
    }

    return {
        title: "Reserva de visita/tutoría cancelada",
        greeting: `Hola ${guestName}`,
        content: `
            <p>Te informamos que tu reserva de visita/tutoría ha sido <strong>cancelada</strong>.</p>
            <p>Detalles de la reserva cancelada:</p>
        `,
        details,
        footerMessage: "Si necesitas hacer una nueva reserva, puedes hacerlo desde nuestro sitio web. Deberás completar todo el proceso de reserva nuevamente."
    };
}

