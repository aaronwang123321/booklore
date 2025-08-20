import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '../shared/database/prisma.service';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Role } from '@prisma/client';

// Mock bcrypt
vi.mock('bcrypt');
const mockedBcrypt = bcrypt as any;

describe('UserService', () => {
  let service: UserService;
  let prismaService: any;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    role: Role.USER,
    isActive: true,
    emailVerified: true,
    password: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
    libraryMembers: [{ libraryId: 1 }, { libraryId: 2 }],
  };

  const mockAdmin = {
    id: 2,
    email: 'admin@example.com',
    name: 'Admin User',
    avatar: null,
    role: Role.ADMIN,
    isActive: true,
    emailVerified: true,
    password: 'hashedPassword',
    createdAt: new Date(),
    updatedAt: new Date(),
    libraryMembers: [],
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    libraryMember: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    prismaService = module.get(PrismaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUser', () => {
    it('should return current user data', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getCurrentUser(1);

      expect(result).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        name: mockUser.name,
        avatar: mockUser.avatar,
        role: mockUser.role,
        isActive: mockUser.isActive,
        emailVerified: mockUser.emailVerified,
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
        assignedLibraries: [1, 2],
      });
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        include: {
          libraryMembers: {
            select: { libraryId: true },
          },
        },
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentUser(999)).rejects.toThrow(
        new NotFoundException('用户不存在'),
      );
    });
  });

  describe('getUserById', () => {
    it('should return user data when requester is admin', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(mockUser); // target user

      const result = await service.getUserById(1, 2);

      expect(result.id).toBe(1);
      expect(result.email).toBe('test@example.com');
    });

    it('should return user data when requester is the same user', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // requester
        .mockResolvedValueOnce(mockUser); // target user

      const result = await service.getUserById(1, 1);

      expect(result.id).toBe(1);
    });

    it('should throw ForbiddenException when requester has no permission', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.getUserById(2, 1)).rejects.toThrow(
        new ForbiddenException('无权限访问此用户信息'),
      );
    });

    it('should throw NotFoundException when target user does not exist', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(null); // target user

      await expect(service.getUserById(999, 2)).rejects.toThrow(
        new NotFoundException('用户不存在'),
      );
    });
  });

  describe('getAllUsers', () => {
    it('should return paginated users list', async () => {
      const users = [mockUser, mockAdmin];
      prismaService.user.findMany.mockResolvedValue(users);
      prismaService.user.count.mockResolvedValue(2);

      const result = await service.getAllUsers(1, 10);

      expect(result).toEqual({
        users: expect.arrayContaining([
          expect.objectContaining({ id: 1, email: 'test@example.com' }),
          expect.objectContaining({ id: 2, email: 'admin@example.com' }),
        ]),
        total: 2,
        page: 1,
        limit: 10,
      });
    });

    it('should handle pagination correctly', async () => {
      prismaService.user.findMany.mockResolvedValue([]);
      prismaService.user.count.mockResolvedValue(0);

      await service.getAllUsers(2, 5);

      expect(prismaService.user.findMany).toHaveBeenCalledWith({
        skip: 5,
        take: 5,
        include: {
          libraryMembers: {
            select: { libraryId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('updateUser', () => {
    const updateData = {
      name: 'Updated Name',
      email: 'updated@example.com',
    };

    it('should update user when requester is admin', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ ...mockUser, ...updateData }); // final user
      prismaService.user.update.mockResolvedValue({ ...mockUser, ...updateData });

      const result = await service.updateUser(1, updateData, 2);

      expect(result.name).toBe('Updated Name');
      expect(result.email).toBe('updated@example.com');
    });

    it('should update user when requester is the same user', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // requester
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ ...mockUser, ...updateData }); // final user
      prismaService.user.update.mockResolvedValue({ ...mockUser, ...updateData });

      const result = await service.updateUser(1, updateData, 1);

      expect(result.name).toBe('Updated Name');
    });

    it('should throw ForbiddenException when non-admin tries to update role', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(1, { ...updateData, role: Role.ADMIN }, 1),
      ).rejects.toThrow(new ForbiddenException('无权限修改用户角色'));
    });

    it('should throw BadRequestException when email already exists', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce({ ...mockUser, id: 999 }); // existing user with email

      await expect(
        service.updateUser(1, updateData, 2),
      ).rejects.toThrow(new BadRequestException('邮箱已被其他用户使用'));
    });

    it('should handle library assignments for admin', async () => {
      const updateDataWithLibraries = {
        ...updateData,
        assignedLibraries: [3, 4],
      };

      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ ...mockUser, ...updateData }); // final user
      prismaService.user.update.mockResolvedValue({ ...mockUser, ...updateData });
      prismaService.libraryMember.deleteMany.mockResolvedValue({ count: 2 });
      prismaService.libraryMember.createMany.mockResolvedValue({ count: 2 });

      await service.updateUser(1, updateDataWithLibraries, 2);

      expect(prismaService.libraryMember.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(prismaService.libraryMember.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 1, libraryId: 3, role: 'READER' },
          { userId: 1, libraryId: 4, role: 'READER' },
        ],
      });
    });
  });

  describe('deleteUser', () => {
    it('should delete user when requester is admin', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(mockUser); // target user
      prismaService.user.delete.mockResolvedValue(mockUser);

      await service.deleteUser(1, 2);

      expect(prismaService.user.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw ForbiddenException when requester is not admin', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.deleteUser(1, 1)).rejects.toThrow(
        new ForbiddenException('无权限删除用户'),
      );
    });

    it('should throw BadRequestException when trying to delete self', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockAdmin);

      await expect(service.deleteUser(2, 2)).rejects.toThrow(
        new BadRequestException('不能删除自己的账户'),
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(null); // target user

      await expect(service.deleteUser(999, 2)).rejects.toThrow(
        new NotFoundException('用户不存在'),
      );
    });
  });

  describe('changePassword', () => {
    const changePasswordDto = {
      currentPassword: 'oldPassword',
      newPassword: 'newPassword',
    };

    it('should change password successfully', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockedBcrypt.hash.mockResolvedValue('hashedNewPassword' as never);
      prismaService.user.update.mockResolvedValue({ ...mockUser, password: 'hashedNewPassword' });

      await service.changePassword(1, changePasswordDto);

      expect(mockedBcrypt.compare).toHaveBeenCalledWith('oldPassword', 'hashedPassword');
      expect(mockedBcrypt.hash).toHaveBeenCalledWith('newPassword', 10);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { password: 'hashedNewPassword' },
      });
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.changePassword(999, changePasswordDto)).rejects.toThrow(
        new NotFoundException('用户不存在或密码未设置'),
      );
    });

    it('should throw BadRequestException when current password is incorrect', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(service.changePassword(1, changePasswordDto)).rejects.toThrow(
        new BadRequestException('当前密码不正确'),
      );
    });
  });

  describe('changeUserPassword', () => {
    const changeUserPasswordDto = {
      newPassword: 'newPassword',
    };

    it('should change user password when requester is admin', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(mockUser); // target user
      mockedBcrypt.hash.mockResolvedValue('hashedNewPassword' as never);
      prismaService.user.update.mockResolvedValue({ ...mockUser, password: 'hashedNewPassword' });

      await service.changeUserPassword(1, changeUserPasswordDto, 2);

      expect(mockedBcrypt.hash).toHaveBeenCalledWith('newPassword', 10);
      expect(prismaService.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { password: 'hashedNewPassword' },
      });
    });

    it('should throw ForbiddenException when requester is not admin', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.changeUserPassword(1, changeUserPasswordDto, 1),
      ).rejects.toThrow(new ForbiddenException('无权限修改其他用户密码'));
    });

    it('should throw NotFoundException when target user does not exist', async () => {
      prismaService.user.findUnique
        .mockResolvedValueOnce(mockAdmin) // requester
        .mockResolvedValueOnce(null); // target user

      await expect(
        service.changeUserPassword(999, changeUserPasswordDto, 2),
      ).rejects.toThrow(new NotFoundException('用户不存在'));
    });
  });

  describe('updateUserSetting', () => {
    it('should throw error as feature is not implemented', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.updateUserSetting(1, { key: 'theme', value: 'dark' })).rejects.toThrow(
        '用户设置更新功能尚未实现',
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      prismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.updateUserSetting(999, { key: 'theme', value: 'dark' })).rejects.toThrow(
        new NotFoundException('用户不存在'),
      );
    });
  });
});