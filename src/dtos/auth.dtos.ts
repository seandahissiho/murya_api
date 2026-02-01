
export interface RegisterDto {
    email?: string;
    phone?: string;
    deviceId?: string;
    password?: string;
    timezone?: string;
}

export interface LoginDto {
    email?: string;
    phone?: string;
    deviceId?: string;
    password?: string;
    timezone?: string;
}

export interface UpdateMeDto {
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    birthDate?: string | Date | null;
    genre?: string | null;
    preferredLangCode?: string | null;
}
