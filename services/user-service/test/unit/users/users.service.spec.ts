import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../../../src/users/users.service';
import { DatabaseService } from '../../../src/database/database.service';

describe('UsersService', () => {
  let service: UsersService;
  let _databaseService: DatabaseService;

  const mockDatabaseService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    _databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      role: 'PASSENGER',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+84912345678',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return user without password hash', async () => {
      mockDatabaseService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserById('user-123');

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'PASSENGER',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+84912345678',
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockDatabaseService.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockDatabaseService.user.findUnique.mockResolvedValue(null);

      await expect(service.getUserById('non-existent')).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  describe('getUserByEmail', () => {
    const mockUser = {
      id: 'user-456',
      email: 'jane@example.com',
      passwordHash: 'hashed-password',
      role: 'DRIVER',
      firstName: 'Jane',
      lastName: 'Smith',
      phone: '+84987654321',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return user without password hash', async () => {
      mockDatabaseService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserByEmail('jane@example.com');

      expect(result).toEqual({
        id: 'user-456',
        email: 'jane@example.com',
        role: 'DRIVER',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+84987654321',
        createdAt: mockUser.createdAt,
        updatedAt: mockUser.updatedAt,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockDatabaseService.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'jane@example.com' },
      });
    });

    it('should throw NotFoundException when user not found', async () => {
      mockDatabaseService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getUserByEmail('notfound@example.com'),
      ).rejects.toThrow(new NotFoundException('User not found'));
    });
  });
});
