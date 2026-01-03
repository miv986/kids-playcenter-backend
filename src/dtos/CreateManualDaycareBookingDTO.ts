import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsDateString,
    MaxLength,
    Min,
} from "class-validator";

export class CreateManualDaycareBookingDTO {
    @IsDateString({}, { message: "La fecha/hora de inicio no es válida." })
    @IsNotEmpty({ message: "El campo startTime es obligatorio." })
    startTime!: string;

    @IsDateString({}, { message: "La fecha/hora de fin no es válida." })
    @IsNotEmpty({ message: "El campo endTime es obligatorio." })
    endTime!: string;

    @IsInt({ message: "El número de niños debe ser un entero." })
    @Min(1, { message: "Debe haber al menos un niño." })
    @IsNotEmpty({ message: "El campo numberOfChildren es obligatorio." })
    numberOfChildren!: number;

    @IsString({ message: "El nombre del cliente debe ser un string." })
    @IsNotEmpty({ message: "El campo clientName es obligatorio." })
    @MaxLength(200, { message: "El nombre no puede exceder los 200 caracteres." })
    clientName!: string;

    @IsOptional()
    @IsString()
    @MaxLength(200, { message: "El nombre del niño no puede exceder los 200 caracteres." })
    childName?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200, { message: "El nombre del padre/madre 1 no puede exceder los 200 caracteres." })
    parent1Name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50, { message: "El teléfono del padre/madre 1 no puede exceder los 50 caracteres." })
    parent1Phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200, { message: "El nombre del padre/madre 2 no puede exceder los 200 caracteres." })
    parent2Name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(50, { message: "El teléfono del padre/madre 2 no puede exceder los 50 caracteres." })
    parent2Phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500, { message: "El comentario no puede exceder los 500 caracteres." })
    comments?: string;

    @IsOptional()
    @IsInt({ message: "El slotId debe ser un número entero." })
    slotId?: number;
}


