
export function createPromise<Result = unknown, Error = unknown>() {
    let resolve: (result: Result) => void;
    let reject: (error: Error) => void;
    const promise = new Promise<Result>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });
    return {
        promise,
        // @ts-expect-error Result is not assignable to type unknown.
        resolve,
        // @ts-expect-error Error is not assignable to type unknown.
        reject,
    };
    
}
