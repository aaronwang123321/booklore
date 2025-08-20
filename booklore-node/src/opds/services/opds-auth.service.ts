import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import * as bcrypt from 'bcrypt';
import { OpdsBasicAuthCredentials } from '../interfaces/opds.interface';
import { CreateOpdsUserDto, UpdateOpdsUserDto } from '../dto/opds.dto';

@Injectable()
export class OpdsAuthService {
  constructor(private prisma: PrismaService) {}

  /**
   * Validate HTTP Basic Auth credentials for OPDS access
   */
  async validateBasicAuth(credentials: OpdsBasicAuthCredentials): Promise<any> {
    const { username, password } = credentials;

    // Find OPDS user by username
    const opdsUser = await this.prisma.opdsUser.findUnique({
      where: { username },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!opdsUser || !opdsUser.isActive || !opdsUser.user.isActive) {
      throw new UnauthorizedException('Invalid OPDS credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, opdsUser.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid OPDS credentials');
    }

    return {
      opdsUserId: opdsUser.id,
      userId: opdsUser.user.id,
      username: opdsUser.username,
      user: opdsUser.user,
    };
  }

  /**
   * Create OPDS user for a regular user
   */
  async createOpdsUser(userId: number, createOpdsUserDto: CreateOpdsUserDto) {
    const { username, password } = createOpdsUserDto;

    // Check if username already exists
    const existingOpdsUser = await this.prisma.opdsUser.findUnique({
      where: { username },
    });

    if (existingOpdsUser) {
      throw new UnauthorizedException('OPDS username already exists');
    }

    // Check if user already has OPDS account
    const existingUserOpds = await this.prisma.opdsUser.findUnique({
      where: { userId },
    });

    if (existingUserOpds) {
      throw new UnauthorizedException('User already has OPDS account');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create OPDS user
    const opdsUser = await this.prisma.opdsUser.create({
      data: {
        username,
        password: hashedPassword,
        userId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    return {
      id: opdsUser.id,
      username: opdsUser.username,
      isActive: opdsUser.isActive,
      user: opdsUser.user,
    };
  }

  /**
   * Update OPDS user
   */
  async updateOpdsUser(userId: number, updateOpdsUserDto: UpdateOpdsUserDto) {
    const opdsUser = await this.prisma.opdsUser.findUnique({
      where: { userId },
    });

    if (!opdsUser) {
      throw new UnauthorizedException('OPDS user not found');
    }

    const updateData: any = {};

    if (updateOpdsUserDto.password) {
      updateData.password = await bcrypt.hash(updateOpdsUserDto.password, 10);
    }

    if (updateOpdsUserDto.isActive !== undefined) {
      updateData.isActive = updateOpdsUserDto.isActive;
    }

    const updatedOpdsUser = await this.prisma.opdsUser.update({
      where: { userId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    return {
      id: updatedOpdsUser.id,
      username: updatedOpdsUser.username,
      isActive: updatedOpdsUser.isActive,
      user: updatedOpdsUser.user,
    };
  }

  /**
   * Get OPDS user by user ID
   */
  async getOpdsUser(userId: number) {
    const opdsUser = await this.prisma.opdsUser.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    if (!opdsUser) {
      return null;
    }

    return {
      id: opdsUser.id,
      username: opdsUser.username,
      isActive: opdsUser.isActive,
      user: opdsUser.user,
    };
  }

  /**
   * Delete OPDS user
   */
  async deleteOpdsUser(userId: number): Promise<void> {
    await this.prisma.opdsUser.delete({
      where: { userId },
    });
  }

  /**
   * Parse HTTP Basic Auth header
   */
  parseBasicAuthHeader(authHeader: string): OpdsBasicAuthCredentials | null {
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return null;
    }

    try {
      const base64Credentials = authHeader.substring(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');

      if (!username || !password) {
        return null;
      }

      return { username, password };
    } catch (error) {
      return null;
    }
  }
}
