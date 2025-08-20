import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { Role } from '@prisma/client';
import { UserResponseDto, UserListResponseDto } from './dto/user-response.dto';
import { UserUpdateDto } from './dto/user-update.dto';
import { ChangePasswordDto, ChangeUserPasswordDto } from './dto/change-password.dto';
import { UpdateUserSettingDto } from './dto/user-setting.dto';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('UserController', () => {
  let controller: UserController;
  let userService: any;

  const mockUserResponse: UserResponseDto = {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    role: Role.USER,
    isActive: true,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    assignedLibraries: [1, 2],
  };

  const mockUserListResponse: UserListResponseDto = {
    users: [mockUserResponse],
    total: 1,
    page: 1,
    limit: 10,
  };

  beforeEach(async () => {
    const mockUserService = {
      getCurrentUser: vi.fn(),
      getUserById: vi.fn(),
      getAllUsers: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      changePassword: vi.fn(),
      changeUserPassword: vi.fn(),
      updateUserSetting: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get(UserService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentUser', () => {
    it('should return current user data', async () => {
      userService.getCurrentUser.mockResolvedValue(mockUserResponse);

      const result = await controller.getCurrentUser(1);

      expect(result).toEqual(mockUserResponse);
      expect(userService.getCurrentUser).toHaveBeenCalledWith(1);
    });
  });

  describe('getUserById', () => {
    it('should return user by id', async () => {
      userService.getUserById.mockResolvedValue(mockUserResponse);

      const result = await controller.getUserById(1, 2);

      expect(result).toEqual(mockUserResponse);
      expect(userService.getUserById).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('getAllUsers', () => {
    it('should return paginated users list', async () => {
      userService.getAllUsers.mockResolvedValue(mockUserListResponse);

      const result = await controller.getAllUsers(1, 10);

      expect(result).toEqual(mockUserListResponse);
      expect(userService.getAllUsers).toHaveBeenCalledWith(1, 10);
    });

    it('should use default pagination values', async () => {
      userService.getAllUsers.mockResolvedValue(mockUserListResponse);

      await controller.getAllUsers(undefined, undefined);

      expect(userService.getAllUsers).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('updateUser', () => {
    it('should update user and return updated data', async () => {
      const updateData: UserUpdateDto = {
        name: 'Updated Name',
        email: 'updated@example.com',
      };
      const updatedUser = { ...mockUserResponse, ...updateData };
      userService.updateUser.mockResolvedValue(updatedUser);

      const result = await controller.updateUser(1, updateData, 2);

      expect(result).toEqual(updatedUser);
      expect(userService.updateUser).toHaveBeenCalledWith(1, updateData, 2);
    });
  });

  describe('deleteUser', () => {
    it('should delete user', async () => {
      userService.deleteUser.mockResolvedValue(undefined);

      const result = await controller.deleteUser(1, 2);

      expect(result).toBeUndefined();
      expect(userService.deleteUser).toHaveBeenCalledWith(1, 2);
    });
  });

  describe('changePassword', () => {
    it('should change user password', async () => {
      const changePasswordDto: ChangePasswordDto = {
        currentPassword: 'oldPassword',
        newPassword: 'newPassword',
      };
      userService.changePassword.mockResolvedValue(undefined);

      const result = await controller.changePassword(1, changePasswordDto);

      expect(result).toBeUndefined();
      expect(userService.changePassword).toHaveBeenCalledWith(1, changePasswordDto);
    });
  });

  describe('changeUserPassword', () => {
    it('should change another user password (admin only)', async () => {
      const changeUserPasswordDto: ChangeUserPasswordDto = {
        newPassword: 'newPassword',
      };
      userService.changeUserPassword.mockResolvedValue(undefined);

      const result = await controller.changeUserPassword(1, changeUserPasswordDto, 2);

      expect(result).toBeUndefined();
      expect(userService.changeUserPassword).toHaveBeenCalledWith(1, changeUserPasswordDto, 2);
    });
  });

  describe('updateUserSetting', () => {
    it('should update user settings', async () => {
      const updateUserSettingDto: UpdateUserSettingDto = {
        key: 'theme',
        value: 'dark',
      };
      userService.updateUserSetting.mockResolvedValue(undefined);

      const result = await controller.updateUserSetting(1, updateUserSettingDto);

      expect(result).toBeUndefined();
      expect(userService.updateUserSetting).toHaveBeenCalledWith(1, updateUserSettingDto);
    });
  });
});