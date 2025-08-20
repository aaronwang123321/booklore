import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { UserUpdateDto } from './dto/user-update.dto';
import { ChangePasswordDto, ChangeUserPasswordDto } from './dto/change-password.dto';
import { UpdateUserSettingDto } from './dto/user-setting.dto';
import { UserResponseDto, UserListResponseDto } from './dto/user-response.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  async getCurrentUser(userId: number): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        libraryMembers: {
          select: { libraryId: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      assignedLibraries: user.libraryMembers.map(member => member.libraryId),
    };
  }

  async getUserById(userId: number, requesterId: number): Promise<UserResponseDto> {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester || (requester.role !== Role.ADMIN && requesterId !== userId)) {
      throw new ForbiddenException('无权限访问此用户信息');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        libraryMembers: {
          select: { libraryId: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      assignedLibraries: user.libraryMembers.map(member => member.libraryId),
    };
  }

  async getAllUsers(page: number = 1, limit: number = 10): Promise<UserListResponseDto> {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        include: {
          libraryMembers: {
            select: { libraryId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    const userDtos = users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      assignedLibraries: user.libraryMembers.map(member => member.libraryId),
    }));

    return {
      users: userDtos,
      total,
      page,
      limit,
    };
  }

  async updateUser(
    userId: number,
    updateData: UserUpdateDto,
    requesterId: number,
  ): Promise<UserResponseDto> {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester || (requester.role !== Role.ADMIN && requesterId !== userId)) {
      throw new ForbiddenException('无权限更新此用户信息');
    }

    if (updateData.role && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('无权限修改用户角色');
    }

    if (updateData.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateData.email },
      });
      if (existingUser && existingUser.id !== userId) {
        throw new BadRequestException('邮箱已被其他用户使用');
      }
    }

    const { assignedLibraries, ...userData } = updateData;

    await this.prisma.user.update({
      where: { id: userId },
      data: userData,
    });

    if (assignedLibraries && requester.role === Role.ADMIN) {
      await this.prisma.libraryMember.deleteMany({
        where: { userId },
      });

      if (assignedLibraries.length > 0) {
        await this.prisma.libraryMember.createMany({
          data: assignedLibraries.map(libraryId => ({
            userId,
            libraryId,
            role: 'READER',
          })),
        });
      }
    }

    const finalUser = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        libraryMembers: {
          select: { libraryId: true },
        },
      },
    });

    return {
      id: finalUser.id,
      email: finalUser.email,
      name: finalUser.name,
      avatar: finalUser.avatar,
      role: finalUser.role,
      isActive: finalUser.isActive,
      emailVerified: finalUser.emailVerified,
      createdAt: finalUser.createdAt,
      updatedAt: finalUser.updatedAt,
      assignedLibraries: finalUser.libraryMembers.map(member => member.libraryId),
    };
  }

  async deleteUser(userId: number, requesterId: number): Promise<void> {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester || requester.role !== Role.ADMIN) {
      throw new ForbiddenException('无权限删除用户');
    }

    if (userId === requesterId) {
      throw new BadRequestException('不能删除自己的账户');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    await this.prisma.user.delete({
      where: { id: userId },
    });
  }

  async changePassword(userId: number, changePasswordDto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new NotFoundException('用户不存在或密码未设置');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('当前密码不正确');
    }

    const hashedNewPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });
  }

  async changeUserPassword(
    userId: number,
    changeUserPasswordDto: ChangeUserPasswordDto,
    requesterId: number,
  ): Promise<void> {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester || requester.role !== Role.ADMIN) {
      throw new ForbiddenException('无权限修改其他用户密码');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const hashedNewPassword = await bcrypt.hash(changeUserPasswordDto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });
  }

  async updateUserSetting(
    userId: number,
    _updateUserSettingDto: UpdateUserSettingDto,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 这里可以根据需要实现用户设置更新逻辑
    // 目前只是一个占位符
    throw new Error('用户设置更新功能尚未实现');
  }
}
