import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ToStrictString } from '../../../common/utils/strict-boolean';

/**
 * Edit a session's label fields. Both are optional so `PATCH /sessions/:id` can change either one
 * on its own; at least one must be present (checked in the service). The name keeps the same rules
 * as create; the Android name is a free-text label and `null`/empty clears it.
 */
export class UpdateSessionDetailsDto {
  @ApiPropertyOptional({
    description: 'New unique name for the session (letters, digits and hyphens only).',
    example: 'Accounts-Bot',
    minLength: 3,
    maxLength: 50,
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'Session name can only contain letters, numbers, and hyphens',
  })
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'A name for the Android phone/account this session is meant to link (e.g. "Office Android"). ' +
      'Send null or an empty string to clear it.',
    example: 'Office Android',
    maxLength: 100,
  })
  @IsOptional()
  @ToStrictString()
  @IsString()
  @MaxLength(100)
  androidName?: string | null;
}
