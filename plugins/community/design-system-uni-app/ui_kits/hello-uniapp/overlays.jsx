/* Overlays — action sheet, modal, toast (uni.showActionSheet / showModal / showToast) */

function ActionSheet({ items, onClose }) {
  return (
    <div className="mask" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="as-group">
          {items.map((it, i) => (
            <div key={i} className={"as-item" + (it.danger ? " danger" : "")} onClick={() => { it.onClick && it.onClick(); onClose(); }}>
              {it.label}
            </div>
          ))}
        </div>
        <div className="as-cancel" onClick={onClose}>取消</div>
      </div>
    </div>
  );
}

function Modal({ title, body, showCancel = true, onCancel, onConfirm }) {
  return (
    <div className="mask">
      <div className="modal-wrap">
        {title && <div className="modal-title">{title}</div>}
        {body && <div className="modal-body">{body}</div>}
        <div className="modal-btns">
          {showCancel && <div className="modal-btn cancel" onClick={onCancel}>取消</div>}
          <div className="modal-btn confirm" onClick={onConfirm}>确定</div>
        </div>
      </div>
    </div>
  );
}

function Toast({ icon, text, loading }) {
  return (
    <div className="mask" style={{ background: "transparent" }}>
      <div className="toast">
        {loading ? <div className="spinner-lg" /> : icon && <span className={"uni-icon uni-icon-" + icon} />}
        {text && <span className="t-text">{text}</span>}
      </div>
    </div>
  );
}

Object.assign(window, { ActionSheet, Modal, Toast });
