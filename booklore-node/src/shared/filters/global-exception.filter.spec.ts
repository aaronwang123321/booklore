import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ThrottlerException } from '@nestjs/throttler';
import { ValidationError } from 'class-validator';
import { vi } from 'vitest';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockArgumentsHost: Partial<ArgumentsHost>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);

    mockRequest = {
      url: '/test',
      method: 'GET',
      headers: {
        'x-request-id': 'test-request-id',
      },
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockArgumentsHost = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue(mockRequest),
        getResponse: vi.fn().mockReturnValue(mockResponse),
      }),
    };
  });

  describe('HTTP异常处理', () => {
    it('应该正确处理HttpException', () => {
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Test error',
          path: '/test',
          method: 'GET',
          timestamp: expect.any(String),
          requestId: 'test-request-id',
        }),
      );
    });

    it('应该正确处理带有详细信息的HttpException', () => {
      const exception = new HttpException(
        {
          message: 'Validation failed',
          details: ['field1 is required', 'field2 must be a number'],
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message: 'Validation failed',
          details: ['field1 is required', 'field2 must be a number'],
        }),
      );
    });
  });

  describe('Prisma错误处理', () => {
    it('应该正确处理P2002唯一约束错误', () => {
      const exception = new PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
          meta: {
            target: ['email'],
          },
        },
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with this data already exists',
          error: 'ConflictError',
        }),
      );
    });

    it('应该正确处理P2025记录未找到错误', () => {
      const exception = new PrismaClientKnownRequestError(
        'Record not found',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        },
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'NotFoundError',
        }),
      );
    });

    it('应该正确处理P2003外键约束错误', () => {
      const exception = new PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '5.0.0',
        },
      );

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Foreign key constraint failed',
          error: 'ForeignKeyError',
        }),
      );
    });
  });

  describe('限流异常处理', () => {
    it('应该正确处理ThrottlerException', () => {
      const exception = new ThrottlerException('Too many requests');

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.TOO_MANY_REQUESTS,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests',
          error: 'ThrottlerException',
        }),
      );
    });
  });

  describe('验证错误处理', () => {
    it('应该正确处理ValidationError数组', () => {
      const validationError = new ValidationError();
      validationError.property = 'email';
      validationError.constraints = {
        isEmail: 'email must be a valid email',
        isNotEmpty: 'email should not be empty',
      };

      const exception = [validationError];

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: expect.arrayContaining([
            'email: email must be a valid email',
            'email: email should not be empty',
          ]),
          error: 'ValidationError',
        }),
      );
    });

    it('应该正确处理嵌套ValidationError', () => {
      const parentError = new ValidationError();
      parentError.property = 'user';
      parentError.children = [];

      const childError = new ValidationError();
      childError.property = 'name';
      childError.constraints = {
        isNotEmpty: 'name should not be empty',
      };

      parentError.children.push(childError);
      const exception = [parentError];

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: expect.arrayContaining(['user.name: name should not be empty']),
          error: 'ValidationError',
        }),
      );
    });
  });

  describe('未知错误处理', () => {
    it('应该正确处理未知错误', () => {
      const exception = new Error('Unknown error');

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'InternalServerError',
        }),
      );
    });

    it('应该正确处理字符串异常', () => {
      const exception = 'String error';

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Internal server error',
          error: 'InternalServerError',
        }),
      );
    });
  });

  describe('错误响应格式', () => {
    it('应该包含所有必需的字段', () => {
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: expect.any(Number),
          timestamp: expect.any(String),
          path: expect.any(String),
          method: expect.any(String),
          message: expect.any(String),
          requestId: expect.any(String),
        }),
      );
    });

    it('应该正确处理没有request-id的情况', () => {
      mockRequest.headers = {};
      const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockArgumentsHost as ArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Test error',
        }),
      );
    });
  });
});