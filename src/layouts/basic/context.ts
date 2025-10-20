import {createContext} from 'react';

export interface BasicLayoutContextValue {
    scrollRef: React.RefObject<HTMLDivElement>;
}
export const BasicLayoutContext = createContext({} as BasicLayoutContextValue);
