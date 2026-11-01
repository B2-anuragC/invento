import { UnprocessableEntityException } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsDecimal, IsEmail, IsString, ValidateNested } from 'class-validator';
import { globalValidationPipe } from './validation.pipe.js';

class LineDto {
  @IsString() productId!: string;
  @IsDecimal() quantity!: string;
}
class BillDto {
  @IsEmail() email!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineDto) items!: LineDto[];
}

async function details(body: unknown) {
  try {
    await globalValidationPipe.transform(body, { type: 'body', metatype: BillDto });
  } catch (error) {
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    return ((error as UnprocessableEntityException).getResponse() as { error: { details: unknown } }).error.details;
  }
  throw new Error('expected a validation failure');
}

describe('globalValidationPipe', () => {
  it('lists top-level failures by field', async () => {
    expect(await details({ email: 'nope', items: [] })).toEqual([{ field: 'email', message: 'email must be an email' }]);
  });

  it('includes failures inside nested lines with their position', async () => {
    expect(await details({ email: 'a@b.co', items: [{ productId: 'p1', quantity: '1' }, { productId: 'p2', quantity: 'abc' }] })).toEqual([
      { field: 'items.1.quantity', message: 'quantity is not a valid decimal number.' },
    ]);
  });

  it('reports fields that are not accepted', async () => {
    expect(await details({ email: 'a@b.co', items: [], extra: 1 })).toEqual([{ field: 'extra', message: 'property extra should not exist' }]);
  });
});
