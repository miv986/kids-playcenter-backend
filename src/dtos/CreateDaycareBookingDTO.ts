import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsDateString,
    Min,
    MaxLength,
} from "class-validator";

export class CreateDaycareBookingDTO {
    @IsInt()
    @IsNotEmpty({ message: "El ID del usuario es obligatorio." })
    userId!: number;

    @IsInt()
    @IsNotEmpty({ message: "El ID del slot es obligatorio." })
    slotId!: number;

    @IsDateString({}, { message: "La fecha/hora de inicio no es válida." })
    @IsNotEmpty({ message: "El campo startTime es obligatorio." })
    startTime!: string;

    @IsDateString({}, { message: "La fecha/hora de fin no es válida." })
    @IsNotEmpty({ message: "El campo endTime es obligatorio." })
    endTime!: string;

    @IsOptional()
    @IsString()
    @MaxLength(500, { message: "El comentario no puede exceder los 500 caracteres." })
    comments?: string;
}
