import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../shared/database/prisma.service';
import { EmailProviderService } from './email-provider.service';
import { EmailRecipientService } from './email-recipient.service';
import { TestEmailDto } from '../dto/email.dto';
import * as fs from 'fs';
import * as path from 'path';

export interface SendEmailOptions {
  bookId: number;
  recipients: string[];
  subject?: string;
  message?: string;
  userId: number;
  providerId?: number;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailProviderService: EmailProviderService,
    private readonly emailRecipientService: EmailRecipientService,
  ) {}

  async sendBookByEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    const { bookId, recipients, subject, message, userId, providerId } = options;

    try {
      // Get book information
      const book = await this.prisma.book.findUnique({
        where: { id: bookId },
        include: {
          library: true,
        },
      });

      if (!book) {
        throw new NotFoundException(`Book with ID ${bookId} not found`);
      }

      // Verify user has access to the book
      const hasAccess = await this.verifyBookAccess(userId, book.libraryId);
      if (!hasAccess) {
        throw new BadRequestException('You do not have access to this book');
      }

      // Verify file exists
      if (!fs.existsSync(book.filePath)) {
        throw new BadRequestException('Book file not found');
      }

      // Get email provider
      const provider = providerId
        ? await this.emailProviderService.findOne(providerId)
        : await this.emailProviderService.findDefault();

      if (!provider) {
        throw new BadRequestException('No email provider configured');
      }

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        auth: {
          user: provider.username,
          pass: provider.password,
        },
      });

      // Verify transporter
      await transporter.verify();

      // Prepare email content
      const emailSubject = subject || `BookLore: ${book.title}`;
      const emailHtml = this.generateEmailTemplate(book, message);

      // Prepare attachment
      const fileExtension = path.extname(book.filePath).substring(1);
      const attachmentFilename = `${book.title}.${fileExtension}`;

      // Send email
      const mailOptions = {
        from: `"BookLore Library" <${provider.username}>`,
        to: recipients.join(', '),
        subject: emailSubject,
        html: emailHtml,
        attachments: [
          {
            filename: attachmentFilename,
            path: book.filePath,
            contentType: book.mimeType,
          },
        ],
      };

      const result = await transporter.sendMail(mailOptions);

      this.logger.log(
        `Email sent successfully for book ${book.title} to ${recipients.length} recipients`,
      );

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      this.logger.error(`Failed to send email for book ${bookId}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async testEmailProvider(testEmailDto: TestEmailDto): Promise<SendEmailResult> {
    const { recipient, providerId } = testEmailDto;

    try {
      // Get email provider
      const provider = providerId
        ? await this.emailProviderService.findOne(providerId)
        : await this.emailProviderService.findDefault();

      if (!provider) {
        throw new BadRequestException('No email provider configured');
      }

      // Create transporter
      const transporter = nodemailer.createTransport({
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        auth: {
          user: provider.username,
          pass: provider.password,
        },
      });

      // Verify transporter
      await transporter.verify();

      // Send test email
      const mailOptions = {
        from: `"BookLore Library" <${provider.username}>`,
        to: recipient,
        subject: 'BookLore Email Test',
        html: this.generateTestEmailTemplate(provider.name),
      };

      const result = await transporter.sendMail(mailOptions);

      this.logger.log(
        `Test email sent successfully to ${recipient} using provider ${provider.name}`,
      );

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      this.logger.error(`Failed to send test email:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async verifyBookAccess(userId: number, libraryId: number): Promise<boolean> {
    // Check if user owns the library
    const ownedLibrary = await this.prisma.library.findFirst({
      where: {
        id: libraryId,
        ownerId: userId,
      },
    });

    if (ownedLibrary) {
      return true;
    }

    // Check if user is a member of the library
    const membership = await this.prisma.libraryMember.findFirst({
      where: {
        userId,
        libraryId,
      },
    });

    return !!membership;
  }

  private generateEmailTemplate(book: any, customMessage?: string): string {
    const coverImageSrc = book.coverImage ? `data:image/jpeg;base64,${book.coverImage}` : null;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BookLore: ${book.title}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
          }
          .book-info {
            display: flex;
            gap: 20px;
            margin-bottom: 25px;
            align-items: flex-start;
          }
          .book-cover {
            flex-shrink: 0;
          }
          .book-cover img {
            width: 120px;
            height: 160px;
            object-fit: cover;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          }
          .book-details {
            flex: 1;
          }
          .book-title {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
          }
          .book-author {
            font-size: 18px;
            color: #7f8c8d;
            margin-bottom: 15px;
          }
          .book-meta {
            font-size: 14px;
            color: #95a5a6;
            line-height: 1.4;
          }
          .message {
            background-color: #f8f9fa;
            border-left: 4px solid #3498db;
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 5px 5px 0;
          }
          .message-title {
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
          }
          .attachment-info {
            background-color: #e8f5e8;
            border: 1px solid #d4edda;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
          }
          .attachment-icon {
            font-size: 24px;
            margin-bottom: 10px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            text-align: center;
            font-size: 12px;
            color: #95a5a6;
          }
          @media (max-width: 600px) {
            .book-info {
              flex-direction: column;
              text-align: center;
            }
            .book-cover {
              align-self: center;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">📚 BookLore</div>
            <p>Your Digital Library</p>
          </div>

          <div class="book-info">
            ${
              coverImageSrc
                ? `
              <div class="book-cover">
                <img src="${coverImageSrc}" alt="${book.title} cover">
              </div>
            `
                : ''
            }
            <div class="book-details">
              <div class="book-title">${book.title}</div>
              ${book.author ? `<div class="book-author">by ${book.author}</div>` : ''}
              <div class="book-meta">
                ${book.publisher ? `<div><strong>Publisher:</strong> ${book.publisher}</div>` : ''}
                ${book.publishDate ? `<div><strong>Published:</strong> ${new Date(book.publishDate).getFullYear()}</div>` : ''}
                ${book.language ? `<div><strong>Language:</strong> ${book.language}</div>` : ''}
                ${book.isbn ? `<div><strong>ISBN:</strong> ${book.isbn}</div>` : ''}
              </div>
            </div>
          </div>

          ${
            book.description
              ? `
            <div class="message">
              <div class="message-title">Description</div>
              <p>${book.description}</p>
            </div>
          `
              : ''
          }

          ${
            customMessage
              ? `
            <div class="message">
              <div class="message-title">Personal Message</div>
              <p>${customMessage}</p>
            </div>
          `
              : ''
          }

          <div class="attachment-info">
            <div class="attachment-icon">📎</div>
            <strong>Book file attached</strong>
            <p>The complete book file is attached to this email for your reading pleasure.</p>
          </div>

          <div class="footer">
            <p>This book was shared from BookLore Digital Library</p>
            <p>Enjoy your reading! 📖</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateTestEmailTemplate(providerName: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>BookLore Email Test</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .container {
            background-color: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 20px;
          }
          .success-icon {
            font-size: 48px;
            color: #27ae60;
            margin-bottom: 20px;
          }
          .message {
            font-size: 18px;
            margin-bottom: 20px;
          }
          .provider-info {
            background-color: #f8f9fa;
            border-radius: 5px;
            padding: 15px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #95a5a6;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">📚 BookLore</div>
          <div class="success-icon">✅</div>
          <div class="message">
            <strong>Email Configuration Test Successful!</strong>
          </div>
          <p>This is a test email to verify that your email provider configuration is working correctly.</p>
          
          <div class="provider-info">
            <strong>Provider:</strong> ${providerName}<br>
            <strong>Test Time:</strong> ${new Date().toLocaleString()}
          </div>

          <p>Your BookLore email sharing feature is now ready to use!</p>

          <div class="footer">
            <p>BookLore Digital Library System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
