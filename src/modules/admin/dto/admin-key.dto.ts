import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdminKeyDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  scopes!: string[];

  @IsOptional()
  @IsInt()
  cproductor?: number;

  @IsOptional()
  @IsInt()
  ccanalalt?: number;

  @IsOptional()
  @IsInt()
  cscanalalt?: number;

  @IsOptional()
  @IsString()
  ctipocanal?: string;

  @IsOptional()
  @IsString()
  xcanal_venta?: string;

  @IsOptional()
  @IsString()
  expires_at?: string;
}

export class UpdateAdminKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  cproductor?: number;

  @IsOptional()
  @IsInt()
  ccanalalt?: number;

  @IsOptional()
  @IsInt()
  cscanalalt?: number;

  @IsOptional()
  @IsString()
  ctipocanal?: string;

  @IsOptional()
  @IsString()
  xcanal_venta?: string;
}
