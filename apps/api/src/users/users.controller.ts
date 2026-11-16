import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { present } from '@opshub/policy';
import {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  type CreateUserInput as CreateUser,
  type ListUsersQuery as ListUsers,
  type UpdateUserInput as UpdateUser,
} from '@opshub/shared';
import { Authenticated, CurrentViewer, Requires } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { MeDto, UserDto } from '../policy/dtos';
import { toUserData, UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @Authenticated()
  async me(@CurrentViewer() viewer: AuthedViewer) {
    const { user, teamName, permissions } = await this.users.me(viewer);
    return present(MeDto, { ...toUserData(user), teamName, permissions });
  }

  @Get('users')
  @Requires('user.read')
  async list(@Query(new ZodPipe(ListUsersQuery)) q: ListUsers) {
    const users = await this.users.list(q.includeInactive);
    return users.map((u) => present(UserDto, toUserData(u)));
  }

  @Post('users')
  @Requires('user.manage', 'ALL')
  async create(@CurrentViewer() viewer: AuthedViewer, @Body(new ZodPipe(CreateUserInput)) body: CreateUser) {
    return present(UserDto, toUserData(await this.users.create(viewer, body)));
  }

  @Patch('users/:id')
  @Requires('user.manage', 'ALL')
  async update(
    @CurrentViewer() viewer: AuthedViewer,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateUserInput)) body: UpdateUser,
  ) {
    return present(UserDto, toUserData(await this.users.update(viewer, id, body)));
  }
}
