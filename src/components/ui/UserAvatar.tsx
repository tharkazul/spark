import React from 'react';
import { Avatar, AvatarProps } from './Avatar';

export type UserAvatarProps = AvatarProps;

export const UserAvatar: React.FC<UserAvatarProps> = (props) => {
  return <Avatar {...props} />;
};

export default UserAvatar;
