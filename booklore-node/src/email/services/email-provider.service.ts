import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { CreateEmailProviderDto, UpdateEmailProviderDto } from '../dto/email.dto';
import { EmailProvider } from '@prisma/client';

@Injectable()
export class EmailProviderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createEmailProviderDto: CreateEmailProviderDto): Promise<EmailProvider> {
    const { isDefault, ...providerData } = createEmailProviderDto;

    // If this is set as default, unset other defaults
    if (isDefault) {
      await this.prisma.emailProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.emailProvider.create({
      data: {
        ...providerData,
        isDefault: isDefault || false,
      },
    });
  }

  async findAll(): Promise<EmailProvider[]> {
    return this.prisma.emailProvider.findMany({
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: number): Promise<EmailProvider> {
    const provider = await this.prisma.emailProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException(`Email provider with ID ${id} not found`);
    }

    return provider;
  }

  async findDefault(): Promise<EmailProvider | null> {
    return this.prisma.emailProvider.findFirst({
      where: { isDefault: true },
    });
  }

  async update(id: number, updateEmailProviderDto: UpdateEmailProviderDto): Promise<EmailProvider> {
    await this.findOne(id);
    const { isDefault, ...updateData } = updateEmailProviderDto;

    // If this is set as default, unset other defaults
    if (isDefault) {
      await this.prisma.emailProvider.updateMany({
        where: {
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.emailProvider.update({
      where: { id },
      data: {
        ...updateData,
        ...(isDefault !== undefined && { isDefault }),
      },
    });
  }

  async remove(id: number): Promise<void> {
    const provider = await this.findOne(id);

    if (provider.isDefault) {
      throw new ConflictException('Cannot delete the default email provider');
    }

    await this.prisma.emailProvider.delete({
      where: { id },
    });
  }

  async setDefault(id: number): Promise<EmailProvider> {
    await this.findOne(id);

    // Unset other defaults
    await this.prisma.emailProvider.updateMany({
      where: {
        isDefault: true,
        id: { not: id },
      },
      data: { isDefault: false },
    });

    // Set this as default
    return this.prisma.emailProvider.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async testConnection(id: number): Promise<boolean> {
    const provider = await this.findOne(id);
    const nodemailer = await import('nodemailer');

    try {
      const transporter = nodemailer.createTransport({
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        auth: {
          user: provider.username,
          pass: provider.password,
        },
      });

      await transporter.verify();
      return true;
    } catch (error) {
      return false;
    }
  }
}
