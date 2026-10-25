import { IsIn, IsInt, IsObject, IsUUID, IsString, Matches, Min, ValidateIf } from 'class-validator';
export class SyncCommandDto {
  @IsUUID('4') operationId!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,100}$/) entityId!: string;
  @IsIn(['products', 'customers', 'suppliers', 'opening-stock']) entity!: 'products' | 'customers' | 'suppliers' | 'opening-stock';
  @IsIn(['create', 'update']) action!: 'create' | 'update';
  @ValidateIf((_o, value) => value !== undefined) @IsInt() @Min(1) baseRevision?: number;
  @IsObject() payload!: Record<string, unknown>;
}
