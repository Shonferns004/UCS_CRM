import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength, ValidateIf, IsIn, Matches } from 'class-validator';
import { MaxCodePoints } from '../../../common/validation/max-code-points';
import { NoNulCharacter } from '../../../common/validation/no-nul-character';
import { ToStrictString } from '../../../common/utils/strict-boolean';

const NAME_MAX_LENGTH = 100;
const BODY_MAX_LENGTH = 4096;
const HEADER_FOOTER_MAX_LENGTH = 1024;
// Types the Broadcast page can attach to a bulk message. Text keeps the old behaviour.
export const TEMPLATE_MESSAGE_TYPES = ['text', 'image', 'video', 'audio', 'document'] as const;
const MEDIA_URL_MAX_LENGTH = 2048;
const MEDIA_FILENAME_MAX_LENGTH = 255;

export class CreateTemplateDto {
  @ApiProperty({
    description: 'Unique template name within the session',
    example: 'order-confirmation',
    maxLength: NAME_MAX_LENGTH,
  })
  @ToStrictString()
  @IsString()
  @IsNotEmpty()
  @MaxCodePoints(NAME_MAX_LENGTH)
  @NoNulCharacter()
  name!: string;

  @ApiProperty({
    description: 'Template body with {{variable}} placeholders',
    example: 'Hi {{customer}}, your order {{orderId}} has shipped.',
    maxLength: BODY_MAX_LENGTH,
  })
  @ToStrictString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BODY_MAX_LENGTH)
  @NoNulCharacter()
  body!: string;

  @ApiPropertyOptional({
    description: 'Optional header text, prepended to the rendered body',
    example: 'OpenWA Store',
    maxLength: HEADER_FOOTER_MAX_LENGTH,
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(HEADER_FOOTER_MAX_LENGTH)
  @NoNulCharacter()
  header?: string;

  @ApiPropertyOptional({
    description: 'Optional footer text, appended to the rendered body',
    example: 'Reply STOP to unsubscribe.',
    maxLength: HEADER_FOOTER_MAX_LENGTH,
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(HEADER_FOOTER_MAX_LENGTH)
  @NoNulCharacter()
  footer?: string;

  @ApiPropertyOptional({
    description: 'Message kind this template produces (text unless a media URL is given)',
    enum: TEMPLATE_MESSAGE_TYPES,
    example: 'text',
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @IsIn(TEMPLATE_MESSAGE_TYPES)
  messageType?: string;

  @ApiPropertyOptional({
    description: 'Media URL attached when messageType is image/video/audio/document',
    example: 'https://cdn.example.com/receipt.pdf',
    maxLength: MEDIA_URL_MAX_LENGTH,
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(MEDIA_URL_MAX_LENGTH)
  @Matches(/^https?:\/\//i, { message: 'mediaUrl must start with http:// or https://' })
  @NoNulCharacter()
  mediaUrl?: string;

  @ApiPropertyOptional({
    description: 'Optional document file name',
    example: 'receipt.pdf',
    maxLength: MEDIA_FILENAME_MAX_LENGTH,
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(MEDIA_FILENAME_MAX_LENGTH)
  @NoNulCharacter()
  mediaFilename?: string;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional({ description: 'Template name', maxLength: NAME_MAX_LENGTH })
  // Not @IsOptional: that also skips null, which then reaches the NOT NULL column as a 500.
  @ValidateIf((o: UpdateTemplateDto) => o.name !== undefined)
  @ToStrictString()
  @IsString()
  @IsNotEmpty()
  @MaxCodePoints(NAME_MAX_LENGTH)
  @NoNulCharacter()
  name?: string;

  @ApiPropertyOptional({ description: 'Template body with {{variable}} placeholders', maxLength: BODY_MAX_LENGTH })
  @ValidateIf((o: UpdateTemplateDto) => o.body !== undefined)
  @ToStrictString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(BODY_MAX_LENGTH)
  @NoNulCharacter()
  body?: string;

  @ApiPropertyOptional({ description: 'Optional header text', maxLength: HEADER_FOOTER_MAX_LENGTH })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(HEADER_FOOTER_MAX_LENGTH)
  @NoNulCharacter()
  header?: string;

  @ApiPropertyOptional({ description: 'Optional footer text', maxLength: HEADER_FOOTER_MAX_LENGTH })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(HEADER_FOOTER_MAX_LENGTH)
  @NoNulCharacter()
  footer?: string;

  @ApiPropertyOptional({ description: 'Message kind (text unless a media URL is given)', enum: TEMPLATE_MESSAGE_TYPES })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @IsIn(TEMPLATE_MESSAGE_TYPES)
  messageType?: string;

  @ApiPropertyOptional({ description: 'Media URL for image/video/audio/document templates', maxLength: MEDIA_URL_MAX_LENGTH })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(MEDIA_URL_MAX_LENGTH)
  @Matches(/^https?:\/\//i, { message: 'mediaUrl must start with http:// or https://' })
  @NoNulCharacter()
  mediaUrl?: string;

  @ApiPropertyOptional({ description: 'Optional document file name', maxLength: MEDIA_FILENAME_MAX_LENGTH })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(MEDIA_FILENAME_MAX_LENGTH)
  @NoNulCharacter()
  mediaFilename?: string;
}

export class TemplateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  body!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  header?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  footer?: string | null;

  @ApiProperty({ enum: TEMPLATE_MESSAGE_TYPES })
  messageType!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  mediaUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  mediaFilename?: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
