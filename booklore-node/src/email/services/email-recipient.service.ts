import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateEmailRecipientDto, UpdateEmailRecipientDto } from '../dto/email.dto';
import { EmailRecipient } from '@prisma/client';

@Injectable()
export class EmailRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: number,
    createEmailRecipientDto: CreateEmailRecipientDto,
  ): Promise<EmailRecipient> {
    const { isDefault, ...recipientData } = createEmailRecipientDto;

    // Check if recipient already exists for this user
    const existingRecipient = await this.prisma.emailRecipient.findUnique({
      where: {
        userId_email: {
          userId,
          email: recipientData.email,
        },
      },
    });

    if (existingRecipient) {
      throw new ConflictException('Email recipient already exists');
    }

    // If this is set as default, unset other defaults for this user
    if (isDefault) {
      await this.prisma.emailRecipient.updateMany({
        where: {
          userId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.emailRecipient.create({
      data: {
        ...recipientData,
        userId,
        isDefault: isDefault || false,
      },
    });
  }

  async findAllByUser(userId: number): Promise<EmailRecipient[]> {
    return this.prisma.emailRecipient.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(userId: number, id: number): Promise<EmailRecipient> {
    const recipient = await this.prisma.emailRecipient.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!recipient) {
      throw new NotFoundException(`Email recipient with ID ${id} not found`);
    }

    return recipient;
  }

  async findDefaultByUser(userId: number): Promise<EmailRecipient | null> {
    return this.prisma.emailRecipient.findFirst({
      where: {
        userId,
        isDefault: true,
      },
    });
  }

  async update(
    userId: number,
    id: number,
    updateEmailRecipientDto: UpdateEmailRecipientDto,
  ): Promise<EmailRecipient> {
    await this.findOne(userId, id);
    const { isDefault, ...updateData } = updateEmailRecipientDto;

    // If this is set as default, unset other defaults for this user
    if (isDefault) {
      await this.prisma.emailRecipient.updateMany({
        where: {
          userId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.emailRecipient.update({
      where: { id },
      data: {
        ...updateData,
        ...(isDefault !== undefined && { isDefault }),
      },
    });
  }

  async remove(userId: number, id: number): Promise<void> {
    await this.findOne(userId, id); // Verify ownership

    await this.prisma.emailRecipient.delete({
      where: { id },
    });
  }

  async setDefault(userId: number, id: number): Promise<EmailRecipient> {
    await this.findOne(userId, id);

    // Unset other defaults for this user
    await this.prisma.emailRecipient.updateMany({
      where: {
        userId,
        isDefault: true,
        id: { not: id },
      },
      data: { isDefault: false },
    });

    // Set this as default
    return this.prisma.emailRecipient.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async validateEmails(emails: string[]): Promise<{ valid: string[]; invalid: string[] }> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const email of emails) {
      if (emailRegex.test(email)) {
        valid.push(email);
      } else {
        invalid.push(email);
      }
    }

    return { valid, invalid };
  }
}
