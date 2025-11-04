
export interface RegisterDto {
    email: string;
    password: string;
    firstname: string;
    lastname: string;
    phone: string;
    birthDate?: Date | null;
}

export interface LoginDto {
    email: string;
    password: string;
}
