extern crate proc_macro;
extern crate proc_macro2;
use std::{collections::{HashMap, VecDeque}};

use proc_macro2::Literal;
use proc_macro::{token_stream::IntoIter, Delimiter, TokenStream, TokenTree};
use quote::{format_ident, quote, ToTokens, TokenStreamExt};
use syn::{Expr, Stmt};

#[proc_macro]
pub fn jazz_template(tokens: TokenStream) -> TokenStream {
  let tokens = Tokens::new(tokens.into_iter());
  let (ast, _) = parse_template(tokens, false);

  let mut stream = quote!(let mut children = Vec::new(););
  for node in ast {
    let result = compile_node(node, false);
    stream = quote!(#stream #result);
  }
  stream = quote! {
    #[allow(unused_braces, unused_parens)]
    fn render(component: &Component<Self::Props, Self::State>) -> Vec<AnyComponent> {
      #stream
      children
    }
  };
  TokenStream::from(stream)
}

fn compile_node(node: AstNode, return_node: bool) -> proc_macro2::TokenStream {
  match node {
    AstNode::Element(Element { tag, props, ast }) => {
      let bind = if props.len() > 0 {
        let mut bindings = quote!();
        for (k, v) in props {
          let k = format_ident!("{}", k);
          let is_closure = match &v {
            PropValue::Expr(syn::Expr::Block(block)) => {
              match block.block.stmts.last() {
                Some(Stmt::Expr(Expr::Closure(_), None)) => true,
                _ => false
              }
            },
            _ => false,
          };
          if is_closure {
            bindings = quote! {
              #bindings
              props.#k = callback!({props, state} #v);
            };
          } else {
            bindings = quote! {
              #bindings
              props.#k = #v;
            };
          }
        }

        let config = if tag == "input" {
          quote!(HtmlInput)
        } else {
          quote!(Html)
        };
        quote! {
          child.bind(&component, move |props, state, ()| {
            let mut props: <#config as ComponentConfig>::Props = Default::default();
            #bindings
            Some(props)
          });
        }
      } else {
        quote!()
      };
      let children = if ast.len() > 0 {
        let mut children = quote!();
        for node in ast {
          let result = compile_node(node, false);
          children = quote!(#children #result);
        }
        quote! {{
          let mut children = Vec::new();
          #children
          child.set_children(children);
        }}
      } else {
        quote!()
      };
      let config = if tag == "input" {
        quote!(HtmlInput)
      } else {
        quote!(Html(#tag))
      };
      let end = if return_node {
        quote!(child.any())
      } else {
        quote!(children.push(child.any());)
      };
      quote! {{
        let child = component.system().create_html_component(#config);
        #bind
        #children
        #end
      }}
    },
    AstNode::Expr(expr) => {
      let end = if return_node {
        quote!(child)
      } else {
        quote!(children.push(child);)
      };
      quote! {{
        let child = IntoComponent::into(move |props, state: &State<Self::State>, ()| #expr, component);
        #end
      }}
    },
    AstNode::Directive(Directive::If(IfDirective { cond, ast, else_ast })) => {
      let if_tokens: Vec<proc_macro2::TokenStream> = ast.into_iter().map(|n| compile_node(n, true)).collect();
      let else_tokens: Vec<proc_macro2::TokenStream> = else_ast.unwrap_or_default().into_iter().map(|n| compile_node(n, true)).collect();
      quote! {{
        let child = component.system().create_component(If);
        children.push(child.any());

        child.state().set_now(IfState {
          if_children: Rc::new(vec![#(#if_tokens,)*]),
          else_children: Rc::new(vec![#(#else_tokens,)*]),
          visible_children: Rc::new(Vec::new()),
        });
        child.bind(&component, |props, state: &State<Self::State>, ()| {
          Some(#cond)
        })
      }}
    },
    AstNode::Directive(Directive::Children) => unimplemented!(),
    AstNode::Directive(Directive::Foreach(_)) => unimplemented!(),
  }
}

struct Tokens {
  it: IntoIter,
  peeked: VecDeque<TokenTree>,
}

impl Iterator for Tokens {
  type Item = TokenTree;
  fn next(&mut self) -> Option<Self::Item> {
    if self.peeked.len() > 0 {
      self.peeked.pop_front()
    } else {
      self.it.next()
    }
  }
}

impl Tokens {
  fn new(it: IntoIter) -> Self {
    Tokens { it, peeked: VecDeque::new() }
  }
  fn peek(&mut self, n: usize) -> Option<&TokenTree> {
    while self.peeked.len() <= n {
      if let Some(next) = self.it.next() {
        self.peeked.push_back(next);
      } else {
        break;
      }
    }
    self.peeked.get(n)
  }
}

#[derive(Debug)]
enum PropValue {
  String(String),
  Expr(syn::Expr),
}

impl ToTokens for PropValue {
  fn to_tokens(&self, tokens: &mut proc_macro2::TokenStream) {
    match &self {
      PropValue::Expr(expr) => {
        expr.to_tokens(tokens);
      },
      PropValue::String(string) => {
        tokens.append(Literal::string(string));
      },
    }
  }
}

#[derive(Debug)]
struct Element {
  tag: String,
  props: HashMap<String, PropValue>,
  ast: Vec<AstNode>,
}

#[derive(Debug)]
struct IfDirective {
  cond: syn::Expr,
  ast: Vec<AstNode>,
  else_ast: Option<Vec<AstNode>>,
}

#[derive(Debug)]
struct ForeachDirective {
  item_name: String,
  index_name: Option<String>,
  expr: syn::Expr,
  ast: Vec<AstNode>,
}

#[derive(Debug)]
enum Directive {
  If(IfDirective),
  Foreach(ForeachDirective),
  Children,
}

#[derive(Debug)]
enum AstNode {
  Element(Element),
  Expr(syn::Expr),
  Directive(Directive)
}

fn is_char(t: Option<&TokenTree>, c: char) -> bool {
  match t {
    Some(TokenTree::Punct(punct)) => punct.as_char() == c,
    _ => false,
  }
}

fn ident(t: Option<&TokenTree>) -> Option<String> {
  match t {
    Some(TokenTree::Ident(ident)) => ident.span().source_text(),
    _ => None,
  }
}

fn string(t: Option<&TokenTree>) -> Option<String> {
  match t {
    Some(TokenTree::Literal(lit)) => {
      let str = format!("{}", lit);
      if str.chars().next() == Some('"') {
        return Some(str);
      }
      None
    },
    _ => None,
  }
}

fn block(t: Option<&TokenTree>) -> Option<TokenStream> {
  match t {
    Some(TokenTree::Group(group)) => {
      if group.delimiter() == Delimiter::Brace {
        return Some(TokenStream::from(t.unwrap().clone()));
      }
      None
    },
    _ => None,
  }
}

fn block_contents(t: Option<&TokenTree>) -> Option<TokenStream> {
  match t {
    Some(TokenTree::Group(group)) => {
      if group.delimiter() == Delimiter::Brace {
        return Some(group.stream());
      }
      None
    },
    _ => None,
  }
}

fn parse_template(mut tokens: Tokens, in_element: bool) -> (Vec<AstNode>, Tokens) {
  let mut ast: Vec<AstNode> = Vec::new();
  while tokens.peek(0).is_some() {
    let t1_block = block(tokens.peek(0));
    let t1_block_contents = block_contents(tokens.peek(0));
    let t1_is_langle = is_char(tokens.peek(0), '<');
    let t2_is_slash = is_char(tokens.peek(1), '/');

    if t1_is_langle && t2_is_slash {
      if !in_element {
        panic!("syntax error: unexpected closing tag: {}", tokens.peek(0).unwrap());
      }
      break;
    }
    if t1_is_langle {
      let result;
      (result, tokens) = parse_element(tokens);
      ast.push(result);
    } else if let Some(block) = t1_block {
      tokens.next();
      let mut block_contents = Tokens::new(t1_block_contents.unwrap().into_iter());
      if is_char(block_contents.peek(0), '@') {
        let (result, _) = parse_directive(block_contents, false);
        ast.push(result);
      } else {
        let expr: syn::Expr = syn::parse(block).expect("syntax error");
        ast.push(AstNode::Expr(expr));
      }
    } else if is_char(tokens.peek(0), '@') {
      let result;
      (result, tokens) = parse_directive(tokens, false);
      ast.push(result);
    } else {
      let result;
      (result, tokens) = parse_text(tokens);
      if let Some(result) = result {
        ast.push(result);
      }
    }
  }
  return (ast, tokens);
}

fn parse_props(mut tokens: Tokens) -> (HashMap<String, PropValue>, Tokens) {
  let mut props: HashMap<String, PropValue> = HashMap::new();
  loop {
    let t = tokens.peek(0);
    if t.is_none() || is_char(t, '/') || is_char(t, '>') {
      break;
    }
    let name = ident(tokens.next().as_ref()).expect("syntax error: expected property name");
    if !is_char(tokens.next().as_ref(), '=') {
      panic!("syntax error: expected '=': {:?}", tokens.next());
    }
    let t = tokens.next();
    if let Some(value) = string(t.as_ref()) {
      props.insert(name, PropValue::String(value));
    } else if let Some(block) = block(t.as_ref()) {
      let expr: syn::Expr = syn::parse(block).expect("syntax error");
      props.insert(name, PropValue::Expr(expr));
    } else {
      panic!("syntax error: expected property value: {:?}", tokens.next());
    }
  }
  return (props, tokens);
}

fn parse_element(mut tokens: Tokens) -> (AstNode, Tokens) {
  let tag = { tokens.next(); tokens.next() };
  let tag = if let Some(tag) = ident(tag.as_ref()) {
    tag
  } else {
    panic!("syntax error: expected tag: {:?}", tag);
  };

  // if (tag[0].toLowerCase() === tag[0] && !(tag in TAGS!)) {
  //   throw new Error("syntax error");
  // }

  let props;
  (props, tokens) = parse_props(tokens);
  let mut self_close = false;
  if is_char(tokens.peek(0), '/') {
    self_close = true;
    let t = {tokens.next(); tokens.next() };
    if !is_char(t.as_ref(), '>') {
      panic!("syntax error: expected '>': {:?}", t);
    }
  } else {
    if !is_char(tokens.next().as_ref(), '>') {
      panic!("syntax error: expected '>': {:?}", tokens.peek(0));
    }
  }
  let mut ast: Vec<AstNode> = Vec::new();
  if !self_close {
    (ast, tokens) = parse_template(tokens, true);
    let t = tokens.next();
    if !is_char(t.as_ref(), '<') || !is_char(tokens.next().as_ref(), '/') {
      panic!("syntax error: expected closing tag for \"{}\": {:?}", tag, t);
    }
    let t = tokens.next();
    if ident(t.as_ref()).as_ref() != Some(&tag) {
      panic!("syntax error: expected closing tag for \"{}\": {:?}", tag, t);
    }
    let t = tokens.next();
    if !is_char(t.as_ref(), '>') {
      panic!("syntax error: expected closing tag for \"{}\": {:?}", tag, t);
    }
  }

  (AstNode::Element(Element { tag, ast, props }), tokens)
}

fn parse_directive(mut tokens: Tokens, allow_else_if: bool) -> (AstNode, Tokens) {
  assert!(is_char(tokens.next().as_ref(), '@'));
  let directive = if let Some(directive) = ident(tokens.next().as_ref()) {
    directive
  } else {
    panic!("syntax error: expected directive: {:?}", tokens.peek(0))
  };

  let result: Directive;
  if directive == "children" {
    result = Directive::Children;
  } else if directive == "if" || (allow_else_if && directive == "elseif") {
    let cond_block = block(tokens.next().as_ref());
    if !cond_block.is_some() {
      panic!("syntax error: expected block: {:?}", cond_block)
    }
    let cond = syn::parse(cond_block.unwrap()).expect("syntax error");
    let template_block = block_contents(tokens.next().as_ref());
    if !template_block.is_some() {
      panic!("syntax error: expected block: {:?}", template_block);
    }
    let ast;
    (ast, _) = parse_template(Tokens::new(template_block.unwrap().into_iter()), true);
    let mut else_ast = None;
    let t1_is_at = is_char(tokens.peek(0), '@');
    let t2_is_else = ident(tokens.peek(1)) == Some("else".into());
    let t2_is_else_if = ident(tokens.peek(1)) == Some("elseif".into());
    let t3_is_block = block(tokens.peek(2)).is_some();
    if t1_is_at && t2_is_else_if {
      let else_if;
      (else_if, tokens) = parse_directive(tokens, true);
      else_ast = Some(vec![else_if]);
    } else if t1_is_at && t2_is_else && t3_is_block {
      let template_block = { tokens.next(); tokens.next(); block_contents(tokens.next().as_ref()) };
      else_ast = Some(parse_template(Tokens::new(template_block.unwrap().into_iter()), true).0);
    }

    result = Directive::If(IfDirective { cond, ast, else_ast });
  } else if directive == "foreach" {
    let iter_block = block_contents(tokens.next().as_ref());
    if !iter_block.is_some() {
      panic!("syntax error: expected block: {:?}", iter_block)
    }
    println!("{:?}", iter_block);
    let mut iter_block = iter_block.unwrap().into_iter();
    let item_name = ident(iter_block.next().as_ref()).expect("syntax error: expected item name:");
    let mut index_name = None;
    let mut t = iter_block.next();
    if is_char(t.as_ref(), ',') {
      index_name = Some(ident(iter_block.next().as_ref()).expect("syntax error: expected item name"));
      t = iter_block.next();
    }
    if ident(t.as_ref()) != Some("in".into()) {
      panic!("syntax error: expected \"in\": {:?}", t);
    }
    let expr: syn::Expr = syn::parse(iter_block.collect()).expect("syntax error");
    let template_block = block_contents(tokens.next().as_ref());
    if !template_block.is_some() {
      panic!("syntax error: expected block: {:?}", template_block);
    }
    let ast;
    (ast, _) = parse_template(Tokens::new(template_block.unwrap().into_iter()), true);
    result = Directive::Foreach(ForeachDirective { item_name, index_name, expr, ast });
  } else {
    panic!("syntax error: unrecognized directive");
  }

  (AstNode::Directive(result), tokens)
}

fn parse_text(mut tokens: Tokens) -> (Option<AstNode>, Tokens) {
  unimplemented!("parse text {:?}", tokens.peek(0));
  // let offset = 0;
  // while (remaining[offset] && !remaining.slice(offset, offset + 2).match(/^(?:[<\{\}@]|\/\/)/)) {
  //   offset++;
  // }
  // const match = remaining.slice(0, offset);
  // const entitiesSplit = match.replaceAll(/[\s\n]+/g, " ").split(/(?<=&\w+;)|(?=&\w+;)/);
  // let result = "";
  // for (let piece of entitiesSplit) {
  //   if (piece.match(/^&\w+;$/)) {
  //     piece = ENTITIES[piece as keyof typeof ENTITIES] ?? piece;
  //   }
  //   result += piece;
  // }
  // return [result === " " ? "" : result, remaining.slice(match.length)];

}

