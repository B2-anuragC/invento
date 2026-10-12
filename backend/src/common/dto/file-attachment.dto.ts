import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class FileAttachmentDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsString() @MinLength(1) @MaxLength(120) mimeType!: string;
  @IsString() @MaxLength(2796204) @Matches(/^[A-Za-z0-9+/]+={0,2}$/) base64!: string;
}
