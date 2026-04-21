export interface LoginRequestDto {
  email: string;
  password?: string;
}

export interface RegisterRequestDto {
  name: string;
  email: string;
  password?: string;
}

export interface UserProfileDto {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponseDto {
  token: string;
  user: UserProfileDto;
}
