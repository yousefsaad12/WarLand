import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username may contain only letters, numbers, and underscores',
  })
  username!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 80)
  displayName!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  password!: string;
}
