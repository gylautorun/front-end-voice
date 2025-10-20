import {
    IAutorunOptions,
    IReactionDisposer,
    IReactionOptions,
    IReactionPublic,
    autorun,
    reaction,
} from 'mobx';

export class ReactionManager {
    disposers: IReactionDisposer[] = [];

    /**
     * 下面是 reaction mobx ts 定义
     */
    reaction<T, FireImmediately extends boolean = false>(
        when: (r: IReactionPublic) => T,
        sideEffect: (arg: T, prev: FireImmediately extends true ? T | undefined : T, r: IReactionPublic) => void,
        opts?: IReactionOptions<T, FireImmediately>
    ) {
        this.disposers.push(
            reaction(
                when,
                sideEffect,
                opts
            )
        );
    }

    /**
     * 下面是 autorun mobx ts 定义
     */
    autorun(action: (r: IReactionPublic) => any, opts?: IAutorunOptions) {
        this.disposers.push(
            autorun(
                action,
                opts
            )
        );
    }

    dispose() {
        this.disposers.forEach(
            dispose => dispose()
        );
        this.disposers = [];
    }
}
