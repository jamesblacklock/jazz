import { Ref, UINode, UITextNode } from "./types";

export type EventListenerWithTarget<E extends Event, T> = (e: Omit<E, "target"> & { target: T }) => void;
export type EventsMap<T extends keyof HTMLElementTagNameMap> = Partial<{ [K in keyof HTMLElementEventMap]: EventListenerWithTarget<HTMLElementEventMap[K], HTMLElementTagNameMap[T]> }>;
export type StyleMap = Partial<Record<keyof CSSStyleDeclaration, string | number>>;
export interface HtmlComponentProps<T extends keyof HTMLElementTagNameMap> extends JSX.IntrinsicAttributes {
  class?: string;
  className?: string;
  events?: EventsMap<T>;
  style?: StyleMap;
  id?: string;
  ref?: Ref<HTMLElementTagNameMap[T]>;
}

export interface HtmlContentComponentProps<
  T extends keyof HTMLElementTagNameMap,
  C = UINode | UINode[],
> extends HtmlComponentProps<T> {
  content?: C;
}

export type HtmlInputProps = HtmlComponentProps<"input"> & {
  value?: string;
};

export type HtmlAProps = HtmlContentComponentProps<"a"> & {
  href?: string;
  target?: string;
};

// export type HtmlChildren<T extends keyof HTMLElementTagNameMap> =
//   UIElement<HtmlContentComponentProps<T>, T> | UIElement<HtmlContentComponentProps<T>, T>[];

declare global {
  namespace JSX {
    interface ElementChildrenAttribute {
      content: {};
    }
    interface IntrinsicAttributes {
      key?: any;
    }

    interface IntrinsicElements {
      // void elements
      area: HtmlComponentProps<"area">;
      base: HtmlComponentProps<"base">;
      br: HtmlComponentProps<"br">;
      col: HtmlComponentProps<"col">;
      embed: HtmlComponentProps<"embed">;
      hr: HtmlComponentProps<"hr">;
      img: HtmlComponentProps<"img">;
      input: HtmlInputProps;
      link: HtmlComponentProps<"link">;
      meta: HtmlComponentProps<"meta">;
      source: HtmlComponentProps<"source">;
      track: HtmlComponentProps<"track">;
      wbr: HtmlComponentProps<"wbr">;

      // text elements
      script: HtmlContentComponentProps<"script", UITextNode>;
      style: HtmlContentComponentProps<"style", UITextNode>;
      textarea: HtmlContentComponentProps<"textarea", UITextNode>;
      title: HtmlContentComponentProps<"title", UITextNode>;

      // normal elements
      a: HtmlAProps;
      abbr: HtmlContentComponentProps<"abbr">;
      address: HtmlContentComponentProps<"address">;
      article: HtmlContentComponentProps<"article">;
      aside: HtmlContentComponentProps<"aside">;
      audio: HtmlContentComponentProps<"audio">;
      b: HtmlContentComponentProps<"b">;
      bdi: HtmlContentComponentProps<"bdi">;
      bdo: HtmlContentComponentProps<"bdo">;
      blockquote: HtmlContentComponentProps<"blockquote">;
      body: HtmlContentComponentProps<"body">;
      button: HtmlContentComponentProps<"button">;
      canvas: HtmlContentComponentProps<"canvas">;
      caption: HtmlContentComponentProps<"caption">;
      cite: HtmlContentComponentProps<"cite">;
      code: HtmlContentComponentProps<"code">;
      colgroup: HtmlContentComponentProps<"colgroup">;
      data: HtmlContentComponentProps<"data">;
      datalist: HtmlContentComponentProps<"datalist">;
      dd: HtmlContentComponentProps<"dd">;
      del: HtmlContentComponentProps<"del">;
      details: HtmlContentComponentProps<"details">;
      dfn: HtmlContentComponentProps<"dfn">;
      dialog: HtmlContentComponentProps<"dialog">;
      div: HtmlContentComponentProps<"div">;
      dl: HtmlContentComponentProps<"dl">;
      dt: HtmlContentComponentProps<"dt">;
      em: HtmlContentComponentProps<"em">;
      fieldset: HtmlContentComponentProps<"fieldset">;
      figcaption: HtmlContentComponentProps<"figcaption">;
      figure: HtmlContentComponentProps<"figure">;
      footer: HtmlContentComponentProps<"footer">;
      form: HtmlContentComponentProps<"form">;
      h1: HtmlContentComponentProps<"h1">;
      h2: HtmlContentComponentProps<"h2">;
      h3: HtmlContentComponentProps<"h3">;
      h4: HtmlContentComponentProps<"h4">;
      h5: HtmlContentComponentProps<"h5">;
      h6: HtmlContentComponentProps<"h6">;
      head: HtmlContentComponentProps<"head">;
      header: HtmlContentComponentProps<"header">;
      hgroup: HtmlContentComponentProps<"hgroup">;
      html: HtmlContentComponentProps<"html">;
      i: HtmlContentComponentProps<"i">;
      iframe: HtmlContentComponentProps<"iframe">;
      ins: HtmlContentComponentProps<"ins">;
      kbd: HtmlContentComponentProps<"kbd">;
      label: HtmlContentComponentProps<"label">;
      legend: HtmlContentComponentProps<"legend">;
      li: HtmlContentComponentProps<"li">;
      main: HtmlContentComponentProps<"main">;
      map: HtmlContentComponentProps<"map">;
      mark: HtmlContentComponentProps<"mark">;
      menu: HtmlContentComponentProps<"menu">;
      meter: HtmlContentComponentProps<"meter">;
      nav: HtmlContentComponentProps<"nav">;
      noscript: HtmlContentComponentProps<"noscript">;
      object: HtmlContentComponentProps<"object">;
      ol: HtmlContentComponentProps<"ol">;
      optgroup: HtmlContentComponentProps<"optgroup">;
      option: HtmlContentComponentProps<"option">;
      output: HtmlContentComponentProps<"output">;
      p: HtmlContentComponentProps<"p">;
      picture: HtmlContentComponentProps<"picture">;
      pre: HtmlContentComponentProps<"pre">;
      progress: HtmlContentComponentProps<"progress">;
      q: HtmlContentComponentProps<"q">;
      rp: HtmlContentComponentProps<"rp">;
      rt: HtmlContentComponentProps<"rt">;
      ruby: HtmlContentComponentProps<"ruby">;
      s: HtmlContentComponentProps<"s">;
      samp: HtmlContentComponentProps<"samp">;
      search: HtmlContentComponentProps<"search">;
      section: HtmlContentComponentProps<"section">;
      select: HtmlContentComponentProps<"select">;
      slot: HtmlContentComponentProps<"slot">;
      small: HtmlContentComponentProps<"small">;
      span: HtmlContentComponentProps<"span">;
      strong: HtmlContentComponentProps<"strong">;
      sub: HtmlContentComponentProps<"sub">;
      summary: HtmlContentComponentProps<"summary">;
      sup: HtmlContentComponentProps<"sup">;
      table: HtmlContentComponentProps<"table">;
      tbody: HtmlContentComponentProps<"tbody">;
      td: HtmlContentComponentProps<"td">;
      template: HtmlContentComponentProps<"template">;
      tfoot: HtmlContentComponentProps<"tfoot">;
      th: HtmlContentComponentProps<"th">;
      thead: HtmlContentComponentProps<"thead">;
      time: HtmlContentComponentProps<"time">;
      tr: HtmlContentComponentProps<"tr">;
      u: HtmlContentComponentProps<"u">;
      ul: HtmlContentComponentProps<"ul">;
      var: HtmlContentComponentProps<"var">;
      video: HtmlContentComponentProps<"video">;

      // a
      // animate
      // animateMotion
      // animateTransform
      // circle
      // clipPath
      // defs
      // desc
      // ellipse
      // feBlend
      // feColorMatrix
      // feComponentTransfer
      // feComposite
      // feConvolveMatrix
      // feDiffuseLighting
      // feDisplacementMap
      // feDistantLight
      // feDropShadow
      // feFlood
      // feFuncA
      // feFuncB
      // feFuncG
      // feFuncR
      // feGaussianBlur
      // feImage
      // feMerge
      // feMergeNode
      // feMorphology
      // feOffset
      // fePointLight
      // feSpecularLighting
      // feSpotLight
      // feTile
      // feTurbulence
      // filter
      // foreignObject
      // g
      // image
      // line
      // linearGradient
      // marker
      // mask
      // metadata
      // mpath
      // path
      // pattern
      // polygon
      // polyline
      // radialGradient
      // rect
      // script
      // set
      // stop
      // style
      // svg
      // switch
      // symbol
      // text
      // textPath
      // title
      // tspan
      // use
      // view
    }
  }
}
