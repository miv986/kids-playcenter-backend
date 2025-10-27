// src/dtos/CreateChildDTO.ts
import { Transform } from "class-transformer";
import { IsString, IsNotEmpty, IsOptional, IsDateString, Matches, IsISO8601 } from "class-validator";

export class CreateChildDTO {
    @IsString({ message: "name debe ser un string" })
    @IsNotEmpty({ message: "name es obligatorio" })
    name!: string;

    @IsString({ message: "surname debe ser un string" })
    @IsNotEmpty({ message: "surname es obligatorio" })
    surname!: string;

    @IsString({ message: "dateOfBirth debe ser un string" })
    @IsNotEmpty({ message: "dateOfBirth es obligatorio" })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "dateOfBirth debe ser una fecha válida (YYYY-MM-DD)" })
    dateOfBirth!: string;
    

    @IsOptional()
    @IsString({ message: "notes debe ser un string" })
    notes?: string;

    @IsOptional()
    @IsString({ message: "medicalNotes debe ser un string" })
    medicalNotes?: string;

    @IsOptional()
    @IsString({ message: "allergies debe ser un string" })
    allergies?: string;

    @IsOptional()
    @IsString({ message: "emergency_contact_name_1 debe ser un string" })
    emergency_contact_name_1?: string;

    @IsOptional()
    @IsString({ message: "emergency_contact_name_2 debe ser un string" })
    emergency_contact_name_2?: string;

    @IsOptional()
    @IsString({ message: "emergency_phone_1 debe ser un string" })
    emergency_phone_1?: string;

    @IsOptional()
    @IsString({ message: "emergency_phone_2 debe ser un string" })
    emergency_phone_2?: string;
}
