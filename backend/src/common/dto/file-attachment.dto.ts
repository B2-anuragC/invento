import { ValidateIf, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class FileAttachmentDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) mimeType!: string;
  @ValidateIf((_o, v) => v !== undefined) @IsString() @MaxLength(13981016) @Matches(/^[A-Za-z0-9+/]+={0,2}$/) base64?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsString() @Matches(/^\/files\/[a-f0-9]{64}\/original$/) url?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsString() @Matches(/^\/files\/[a-f0-9]{64}\/thumbnail$/) thumbnailUrl?: string;
}
