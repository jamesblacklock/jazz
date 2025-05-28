# Jazz

Jazz is a React alternative. It works a lot like React. Jazz only supports functional components.

```jsx
import jazz, { useState, useRef, useEffect } from "@dragonpop/jazz";

function App({ name }) {
  const [greeting, setGreeting] = useState("Hello");
  const ref = useRef();

  useEffect(() => {
    if (ref.current) {
      ref.current.style.color = "red";
    }
  }, [ref.current]);

  return (
    <>
      <h1 ref={ref} style={{ textAlign: "center" }}>{greeting}, {name}!</h1>
      <button events={{ click: e => setGreeting("Goodbye") }}>I'm leaving</button>
    <>
  );
}

jazz.mountComponent(document.body, <App name={"James"} />);
```

You can also manipulate state via a `state` argument. This also enables named state
lookups, obviating the requirement that state hooks be called the same number of times
or in the same order during each render.


```jsx
import jazz from "@dragonpop/jazz";

function App({ name }, state) {
  const [greeting, setGreeting] = state.use("greeting", "Hello");
  const ref = state.useRef("ref");

  state.useEffect("effect1", () => {
    if (ref.current) {
      ref.current.style.color = "red";
    }
  }, [ref.current]);

  return (
    <>
      <h1 ref={ref} style={{ textAlign: "center" }}>{greeting}, {name}!</h1>
      <button events={{ click: e => setGreeting("Goodbye") }}>I'm leaving</button>
    <>
  );
}
```

In order to use Jazz with JSX, you will need your build system configured to generate
the correct code. If you are using `tsc` (the TypeScript compiler), the relevant
settings in your `tsconfig.json` look like this:

```json
{
  "compilerOptions": {
    "jsx": "react",
    "jsxFactory": "jazz.createElement",
    "jsxFragmentFactory": "jazz.fragment"
  }
}
```

Then you will need to import `jazz` inside of every file in which you use the JSX syntax.

Jazz is alpha software. Things are probably broken.
