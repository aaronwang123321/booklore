import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { SetupStatusDto, FirstUserDto, SetupResponseDto } from './dto/setup.dto';

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getSetupStatus(): Promise<SetupStatusDto> {
    const totalUsers = await this.prisma.user.count();
    const adminUsers = await this.prisma.user.count({
      where: {
        role: Role.ADMIN,
      },
    });

    return {
      isSetupComplete: adminUsers > 0,
      hasAdminUsers: adminUsers > 0,
      totalUsers,
    };
  }

  async createFirstUser(firstUserDto: FirstUserDto): Promise<SetupResponseDto> {
    // Check if setup is already complete
    const setupStatus = await this.getSetupStatus();
    if (setupStatus.isSetupComplete) {
      throw new ConflictException('Setup is already complete. Admin user already exists.');
    }

    // Check if email already exists
    const existingUser = await this.prisma.user.findFirst({
      where: { email: firstUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists.');
    }

    try {
      // Hash the password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(firstUserDto.password, saltRounds);

      // Create the first admin user
      const user = await this.prisma.user.create({
        data: {
          email: firstUserDto.email,
          name: firstUserDto.displayName || firstUserDto.username,
          password: hashedPassword,
          role: Role.ADMIN,
          isActive: true,
          emailVerified: true, // First admin user is automatically verified
        },
      });

      return {
        message: 'First admin user created successfully',
        userId: user.id,
        setupComplete: true,
      };
    } catch (error) {
      throw new BadRequestException('Failed to create first admin user: ' + error.message);
    }
  }

  async isSetupComplete(): Promise<boolean> {
    const adminCount = await this.prisma.user.count({
      where: {
        role: Role.ADMIN,
      },
    });
    return adminCount > 0;
  }
}
