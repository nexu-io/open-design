function InputBar() {
  return (
    <form className="g2-input-bar" onSubmit={(event) => event.preventDefault()}>
      <input className="g2-command-input" aria-label="G2 command" placeholder="Speak or type a G2 command" />
      <button className="g2-send-button" type="button">Send</button>
    </form>
  );
}

window.InputBar = InputBar;
