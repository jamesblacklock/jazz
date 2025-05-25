import type { State } from "../renderUI";

export type DebugInfo = { renderCount: number, debug?: boolean };
export type Props = Record<keyof any, any>;
export type ComponentType<P extends Props = Props> = ComponentFunction<P> | keyof HTMLElementTagNameMap | "TEXT";
export type UIElement<P extends Props = Props, T extends ComponentType = ComponentType> = {
  type: T;
  props?: P;
  content?: UINode;
  key?: any;
};
export type UINode = UINode[] | UIElement | UIElement[] | string | number | false | null | undefined;
export type ComponentFunction<T extends Props = Props> = (props: T, state: State, debugInfo: DebugInfo) => UINode;
export type Component<P extends Props = Props, T extends ComponentType = ComponentType> = {
  type: T;
  props?: P;
  content?: Component[];
  key?: any;
};
export type RefObject<T = any> = { current?: T };
export type RefFunction<T = any> = ((current: T) => void)
export type Ref<T = any> = RefObject<T> | RefFunction<T>;
export type RenderOptions = {
  debug?: boolean;
};
