import {
  Field,
  Float,
  ID,
  InputType,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

@InputType()
export class StringFieldComparison {
  @Field({ nullable: true }) is?: boolean;
  @Field({ nullable: true }) isNot?: boolean;
  @Field({ nullable: true }) eq?: string;
  @Field({ nullable: true }) neq?: string;
  @Field({ nullable: true }) gt?: string;
  @Field({ nullable: true }) gte?: string;
  @Field({ nullable: true }) lt?: string;
  @Field({ nullable: true }) lte?: string;
  @Field({ nullable: true }) like?: string;
  @Field({ nullable: true }) notLike?: string;
  @Field({ nullable: true }) iLike?: string;
  @Field({ nullable: true }) notILike?: string;
  @Field(() => [String], { nullable: true }) in?: string[];
  @Field(() => [String], { nullable: true }) notIn?: string[];
}

@InputType()
export class NumberFieldComparison {
  @Field({ nullable: true }) is?: boolean;
  @Field({ nullable: true }) isNot?: boolean;
  @Field(() => Float, { nullable: true }) eq?: number;
  @Field(() => Float, { nullable: true }) neq?: number;
  @Field(() => Float, { nullable: true }) gt?: number;
  @Field(() => Float, { nullable: true }) gte?: number;
  @Field(() => Float, { nullable: true }) lt?: number;
  @Field(() => Float, { nullable: true }) lte?: number;
  @Field(() => [Float], { nullable: true }) in?: number[];
  @Field(() => [Float], { nullable: true }) notIn?: number[];
}

@InputType()
export class IntFieldComparison {
  @Field({ nullable: true }) is?: boolean;
  @Field({ nullable: true }) isNot?: boolean;
  @Field(() => Int, { nullable: true }) eq?: number;
  @Field(() => Int, { nullable: true }) neq?: number;
  @Field(() => Int, { nullable: true }) gt?: number;
  @Field(() => Int, { nullable: true }) gte?: number;
  @Field(() => Int, { nullable: true }) lt?: number;
  @Field(() => Int, { nullable: true }) lte?: number;
  @Field(() => [Int], { nullable: true }) in?: number[];
  @Field(() => [Int], { nullable: true }) notIn?: number[];
}

@InputType()
export class BooleanFieldComparison {
  @Field({ nullable: true }) is?: boolean;
  @Field({ nullable: true }) isNot?: boolean;
  @Field({ nullable: true }) eq?: boolean;
  @Field({ nullable: true }) neq?: boolean;
}

@InputType()
export class DateFieldComparison {
  @Field({ nullable: true }) is?: boolean;
  @Field({ nullable: true }) isNot?: boolean;
  @Field(() => Date, { nullable: true }) eq?: Date;
  @Field(() => Date, { nullable: true }) neq?: Date;
  @Field(() => Date, { nullable: true }) gt?: Date;
  @Field(() => Date, { nullable: true }) gte?: Date;
  @Field(() => Date, { nullable: true }) lt?: Date;
  @Field(() => Date, { nullable: true }) lte?: Date;
  @Field(() => [Date], { nullable: true }) in?: Date[];
  @Field(() => [Date], { nullable: true }) notIn?: Date[];
}

@InputType()
export class IDFilterComparison {
  @Field({ nullable: true }) is?: boolean;
  @Field({ nullable: true }) isNot?: boolean;
  @Field(() => ID, { nullable: true }) eq?: string;
  @Field(() => ID, { nullable: true }) neq?: string;
  @Field(() => [ID], { nullable: true }) in?: string[];
  @Field(() => [ID], { nullable: true }) notIn?: string[];
}

export enum SortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}
registerEnumType(SortDirection, { name: 'SortDirection' });

export enum SortNulls {
  NULLS_FIRST = 'NULLS_FIRST',
  NULLS_LAST = 'NULLS_LAST',
}
registerEnumType(SortNulls, { name: 'SortNulls' });

@InputType()
export class OffsetPaging {
  @Field(() => Int, { nullable: true, defaultValue: 10 }) limit?: number;
  @Field(() => Int, { nullable: true, defaultValue: 0 }) offset?: number;
}

@ObjectType()
export class OffsetPageInfo {
  @Field() hasNextPage!: boolean;
  @Field() hasPreviousPage!: boolean;
}

@ObjectType()
export class UpdateManyResponse {
  @Field(() => Int) updatedCount!: number;
}

@ObjectType()
export class DeleteManyResponse {
  @Field(() => Int) deletedCount!: number;
}
