// import type { State } from "./index";

// export type DebugInfo = { renderCount: number, debug?: boolean };
// export type Props = Record<keyof any, any> | undefined | null;
// export type TextNodeProps = { textContent: string };
// export type ComponentType<P extends Props = Props> = ComponentFunction<P> | keyof HTMLElementTagNameMap | "TEXT";
// export type UIElement<P extends Props = Props, T extends ComponentType = ComponentType> = {
//   type: T;
//   props: P;
//   content: UINode;
//   key: any;
//   domParent?: HTMLElement;
// };
// export type UITextNode = UITextNode[] | UIElement<TextNodeProps, "TEXT"> | string | number | false | null | undefined;
// export type UINode = UINode[] | UIElement | UITextNode;
// export type ComponentFunction<T extends Props = Props> = (props: T, state: State, debugInfo: DebugInfo) => UINode;
// export type Component<P extends Props = Props, T extends ComponentType = ComponentType> = {
//   type: T;
//   props?: P;
//   content?: Component[];
//   key?: any;
//   changed?: boolean;
//   domParent?: HTMLElement;
// };
// export type RefObject<T = any> = { current?: T };
// export type RefFunction<T = any> = ((current: T) => void)
// export type Ref<T = any> = RefObject<T> | RefFunction<T>;
// export type RenderOptions = {
//   debug?: boolean;
// };




