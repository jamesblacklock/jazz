import { UIElement, Ref, UINode } from "./uiTypes";

export type EventListenerWithTarget<T> = (e: Omit<Event, "target"> & { target: T }) => void;
export type EventsMap<T extends keyof HTMLElementTagNameMap> = Partial<Record<keyof HTMLElementEventMap, EventListenerWithTarget<HTMLElementTagNameMap[T]>>>;
export type StyleMap = Partial<Record<keyof CSSStyleDeclaration, string | number>>;
export interface HtmlComponentProps<T extends keyof HTMLElementTagNameMap> extends JSX.IntrinsicAttributes {
  class?: string;
  className?: string;
  events?: EventsMap<T>;
  style?: StyleMap;
  id?: string;
  ref?: Ref<HTMLElementTagNameMap[T]>;
}

export interface HtmlContentComponentProps<T extends keyof HTMLElementTagNameMap, C = UINode> extends HtmlComponentProps<T> {
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
      a: HtmlAProps;
      abbr: HtmlComponentProps<"abbr">;
      address: HtmlComponentProps<"address">;
      area: HtmlComponentProps<"area">;
      article: HtmlComponentProps<"article">;
      aside: HtmlComponentProps<"aside">;
      audio: HtmlComponentProps<"audio">;
      b: HtmlContentComponentProps<"b">;
      base: HtmlComponentProps<"base">;
      bdi: HtmlComponentProps<"bdi">;
      bdo: HtmlComponentProps<"bdo">;
      blockquote: HtmlComponentProps<"blockquote">;
      body: HtmlContentComponentProps<"body">;
      br: HtmlComponentProps<"br">;
      button: HtmlContentComponentProps<"button">;
      canvas: HtmlComponentProps<"canvas">;
      caption: HtmlComponentProps<"caption">;
      cite: HtmlComponentProps<"cite">;
      code: HtmlComponentProps<"code">;
      col: HtmlComponentProps<"col">;
      colgroup: HtmlComponentProps<"colgroup">;
      data: HtmlComponentProps<"data">;
      datalist: HtmlComponentProps<"datalist">;
      dd: HtmlComponentProps<"dd">;
      del: HtmlComponentProps<"del">;
      details: HtmlComponentProps<"details">;
      dfn: HtmlComponentProps<"dfn">;
      dialog: HtmlComponentProps<"dialog">;
      div: HtmlContentComponentProps<"div">;
      dl: HtmlComponentProps<"dl">;
      dt: HtmlComponentProps<"dt">;
      em: HtmlComponentProps<"em">;
      embed: HtmlComponentProps<"embed">;
      fieldset: HtmlComponentProps<"fieldset">;
      figcaption: HtmlComponentProps<"figcaption">;
      figure: HtmlComponentProps<"figure">;
      footer: HtmlComponentProps<"footer">;
      form: HtmlContentComponentProps<"form">;
      h1: HtmlContentComponentProps<"h1">;
      h2: HtmlContentComponentProps<"h2">;
      h3: HtmlContentComponentProps<"h3">;
      h4: HtmlContentComponentProps<"h4">;
      h5: HtmlContentComponentProps<"h5">;
      h6: HtmlContentComponentProps<"h6">;
      head: HtmlContentComponentProps<"head">;
      header: HtmlComponentProps<"header">;
      hgroup: HtmlComponentProps<"hgroup">;
      hr: HtmlComponentProps<"hr">;
      html: HtmlContentComponentProps<"html">;
      i: HtmlContentComponentProps<"i">;
      iframe: HtmlComponentProps<"iframe">;
      img: HtmlComponentProps<"img">;
      input: HtmlInputProps;
      ins: HtmlComponentProps<"ins">;
      kbd: HtmlComponentProps<"kbd">;
      label: HtmlContentComponentProps<"label">;
      legend: HtmlComponentProps<"legend">;
      li: HtmlContentComponentProps<"li">;
      link: HtmlComponentProps<"link">;
      main: HtmlComponentProps<"main">;
      map: HtmlComponentProps<"map">;
      mark: HtmlComponentProps<"mark">;
      menu: HtmlComponentProps<"menu">;
      meta: HtmlComponentProps<"meta">;
      meter: HtmlComponentProps<"meter">;
      nav: HtmlComponentProps<"nav">;
      noscript: HtmlComponentProps<"noscript">;
      object: HtmlComponentProps<"object">;
      ol: HtmlContentComponentProps<"ol">;
      optgroup: HtmlComponentProps<"optgroup">;
      option: HtmlComponentProps<"option">;
      output: HtmlComponentProps<"output">;
      p: HtmlContentComponentProps<"p">;
      picture: HtmlComponentProps<"picture">;
      pre: HtmlContentComponentProps<"pre">;
      progress: HtmlComponentProps<"progress">;
      q: HtmlComponentProps<"q">;
      rp: HtmlComponentProps<"rp">;
      rt: HtmlComponentProps<"rt">;
      ruby: HtmlComponentProps<"ruby">;
      s: HtmlComponentProps<"s">;
      samp: HtmlComponentProps<"samp">;
      script: HtmlContentComponentProps<"script">;
      search: HtmlComponentProps<"search">;
      section: HtmlComponentProps<"section">;
      select: HtmlComponentProps<"select">;
      slot: HtmlComponentProps<"slot">;
      small: HtmlComponentProps<"small">;
      source: HtmlComponentProps<"source">;
      span: HtmlContentComponentProps<"span">;
      strong: HtmlComponentProps<"strong">;
      style: HtmlComponentProps<"style">;
      sub: HtmlComponentProps<"sub">;
      summary: HtmlComponentProps<"summary">;
      sup: HtmlComponentProps<"sup">;
      table: HtmlContentComponentProps<"table">;
      tbody: HtmlContentComponentProps<"tbody">;
      td: HtmlContentComponentProps<"td">;
      template: HtmlContentComponentProps<"template">;
      textarea: HtmlContentComponentProps<"textarea">;
      tfoot: HtmlComponentProps<"tfoot">;
      th: HtmlContentComponentProps<"th">;
      thead: HtmlContentComponentProps<"thead">;
      time: HtmlComponentProps<"time">;
      title: HtmlContentComponentProps<"title">;
      tr: HtmlContentComponentProps<"tr">;
      track: HtmlComponentProps<"track">;
      u: HtmlComponentProps<"u">;
      ul: HtmlContentComponentProps<"ul">;
      var: HtmlComponentProps<"var">;
      video: HtmlComponentProps<"video">;
      wbr: HtmlComponentProps<"wbr">;



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
