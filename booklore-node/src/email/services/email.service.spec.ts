import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailProviderService } from './email-provider.service';
import { EmailRecipientService } from './email-recipient.service';
import { PrismaService } from '../../shared/database/prisma.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

describe('EmailService', () => {
  let service: EmailService;
  let prismaService: PrismaService;
  let emailProviderService: EmailProviderService;
  let emailRecipientService: EmailRecipientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: PrismaService,
          useValue: {
            book: {
              findUnique: vi.fn(),
            },
            library: {
              findFirst: vi.fn(),
            },
            libraryMember: {
              findFirst: vi.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn(),
          },
        },
        {
          provide: EmailProviderService,
          useValue: {
            findOne: vi.fn(),
            findDefault: vi.fn(),
          },
        },
        {
          provide: EmailRecipientService,
          useValue: {
            validateEmails: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailProviderService = module.get<EmailProviderService>(EmailProviderService);
    emailRecipientService = module.get<EmailRecipientService>(EmailRecipientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendBookByEmail', () => {
    it('should throw NotFoundException if book not found', async () => {
      const options = {
        bookId: 1,
        recipients: ['test@example.com'],
        userId: 1,
      };

      vi.mocked(prismaService.book.findUnique).mockResolvedValue(null);

      const result = await service.sendBookByEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Book with ID 1 not found');
    });

    it('should throw BadRequestException if no email provider configured', async () => {
      const options = {
        bookId: 1,
        recipients: ['test@example.com'],
        userId: 1,
      };

      const mockBook = {
        id: 1,
        title: 'Test Book',
        filePath: '/test/book.epub',
        libraryId: 1,
        library: { id: 1, ownerId: 1 },
      };

      // Mock file existence
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(prismaService.book.findUnique).mockResolvedValue(mockBook as any);
      vi.mocked(prismaService.library.findFirst).mockResolvedValue({ id: 1, ownerId: 1 } as any);
      vi.mocked(emailProviderService.findDefault).mockResolvedValue(null);

      const result = await service.sendBookByEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No email provider configured');
    });
  });

  describe('testEmailProvider', () => {
    it('should return error if no email provider configured', async () => {
      const testData = {
        recipient: 'test@example.com',
      };

      vi.mocked(emailProviderService.findDefault).mockResolvedValue(null);

      const result = await service.testEmailProvider(testData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No email provider configured');
    });
  });

  describe('generateEmailTemplate', () => {
    it('should generate HTML email template', () => {
      const book = {
        title: 'Test Book',
        author: 'Test Author',
        description: 'Test Description',
        coverImage: null,
      };

      const template = (service as any).generateEmailTemplate(book, 'Test message');

      expect(template).toContain('Test Book');
      expect(template).toContain('Test Author');
      expect(template).toContain('Test Description');
      expect(template).toContain('Test message');
      expect(template).toContain('BookLore');
    });

    it('should include cover image if available', () => {
      const book = {
        title: 'Test Book',
        author: 'Test Author',
        coverImage: 'base64imagedata',
      };

      const template = (service as any).generateEmailTemplate(book);

      expect(template).toContain('data:image/jpeg;base64,base64imagedata');
    });
  });

  describe('generateTestEmailTemplate', () => {
    it('should generate test email template', () => {
      const providerName = 'Test Provider';

      const template = (service as any).generateTestEmailTemplate(providerName);

      expect(template).toContain('Test Provider');
      expect(template).toContain('Email Configuration Test Successful');
      expect(template).toContain('BookLore');
    });
  });
});