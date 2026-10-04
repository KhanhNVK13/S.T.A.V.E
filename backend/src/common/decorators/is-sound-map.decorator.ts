import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isValidSoundMap } from '@stave/shared-types';

export function IsSoundMap(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSoundMap',
      target: object.constructor,
      propertyName,
      options: {
        message: 'soundMap must map pitches 0-127 to custom sound ids',
        ...options,
      },
      validator: {
        validate: (value: unknown) => isValidSoundMap(value),
      },
    });
  };
}
