// 临时类型定义，用于修复编译错误
declare module '*.json' {
  const value: any;
  export default value;
}

// 扩展 Library 类型
interface Library {
  id: number;
  name: string;
  description: string;
  ownerId: number;
  isPublic: boolean;
  members?: Array<{ userId: number }>;
  settings?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

// 扩展 Stripe 类型
declare namespace Stripe {
  interface SubscriptionCreateParams {
    metadata?: { [key: string]: string };
  }
}
