import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Req, Strategy } from './types';

/** Only what the user sets in the form. Everything else (pods, versions, log) lives in the cluster. */
export interface Form {
  strategy: Strategy;
  req: Req;
  autoId: boolean; // every new instance is a new user: ID 1, 2, 3 …
  nextUserId: number;
  base: string;
  target: string;
  weight: number;
  maxSurge: number;
  recreateMs: number;
  shadowOn: boolean;
}

export const initialForm: Form = {
  strategy: 'canary',
  req: { userId: 'Anna' },
  autoId: true,
  nextUserId: 1,
  base: 'v1',
  target: 'v2',
  weight: 25,
  maxSurge: 1,
  recreateMs: 3000,
  shadowOn: true,
};

export type Action =
  | { type: 'patch'; patch: Partial<Form> }
  | { type: 'patchReq'; patch: Partial<Req> };

function reducer(f: Form, a: Action): Form {
  switch (a.type) {
    case 'patch': return { ...f, ...a.patch };
    case 'patchReq': return { ...f, req: { ...f.req, ...a.patch } };
  }
}

const Ctx = createContext<{ form: Form; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [form, dispatch] = useReducer(reducer, initialForm);
  return <Ctx.Provider value={{ form, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
