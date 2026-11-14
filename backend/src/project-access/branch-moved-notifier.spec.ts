import { BranchMovedNotifier } from './branch-moved-notifier';

describe('BranchMovedNotifier', () => {
  it('delivers a move to every subscriber and stops after unsubscribe', () => {
    const notifier = new BranchMovedNotifier();
    const first = jest.fn();
    const second = jest.fn();
    notifier.subscribe(first);
    const unsubscribe = notifier.subscribe(second);

    notifier.notify('p', 'b', 'c', 'u');
    unsubscribe();
    notifier.notify('p', 'b', 'c2', 'u');

    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith('p', 'b', 'c', 'u');
  });

  it('keeps notifying the others when one subscriber throws', () => {
    const notifier = new BranchMovedNotifier();
    const survivor = jest.fn();
    notifier.subscribe(() => {
      throw new Error('boom');
    });
    notifier.subscribe(survivor);

    expect(() => notifier.notify('p', 'b', 'c', 'u')).not.toThrow();
    expect(survivor).toHaveBeenCalledTimes(1);
  });
});
