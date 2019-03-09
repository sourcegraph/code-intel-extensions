//
//  Created by Tom Baranes on 24/04/16.
//  Copyright © 2016 Tom Baranes. All rights reserved.
//

import Foundation
import UIKit

// MARK: - Localizables

extension UIView {

    @objc
    public func translateSubviews() {
        if subviews.isEmpty {
            return
        }

        for subview in subviews {
            translate(subview)
            if #available(iOS 9.0, *), let stackView = subview as? UIStackView {
                stackView.arrangedSubviews.forEach {
                    self.translate($0)
                    $0.translateSubviews()
                }
            } else {
                subview.translateSubviews()
            }
        }
    }

    private func translate(_ subview: UIView) {
        if let label = subview as? UILabel {
            label.text = NSLocalizedString(label.text ?? "", comment: "")
        } else if let textField = subview as? UITextField {
            textField.text = NSLocalizedString(textField.text ?? "", comment: "")
            textField.placeholder = NSLocalizedString(textField.placeholder ?? "", comment: "")
        } else if let textView = subview as? UITextView {
            textView.text = NSLocalizedString(textView.text, comment: "")
        } else if let button = subview as? UIButton {
            let states: [UIControlState] = [.normal, .selected, .highlighted, .disabled, .application, .reserved]
            for state in states where button.title(for: state) != nil {
                button.setTitle(NSLocalizedString(button.title(for: state) ?? "", comment: ""), for: state)
            }
        }
    }

}

// MARK: - Frame

extension UIView {
    public var x: CGFloat {
        get { return frame.x }
        set { frame = frame.with(x: newValue) }
    }

    public var y: CGFloat {
        get { return frame.y }
        set { frame = frame.with(y: newValue) }
    }

    public var width: CGFloat {
        get { return frame.width }
        set { frame = frame.with(width: newValue) }
    }

    public var height: CGFloat {
        get { return frame.height }
        set { frame = frame.with(height: newValue) }
    }
}

// MARK: - Getter

extension CGRect {

    public var x: CGFloat {
        return origin.x
    }

    public var y: CGFloat {
        return origin.y
    }

    public func with(x: CGFloat) -> CGRect {
        return CGRect(x: x, y: y, width: width, height: height)
    }

}

// MARK: - Transform

extension CGRect {

    public func with(y: CGFloat) -> CGRect {
        return CGRect(x: x, y: y, width: width, height: height)
    }

    public func with(width: CGFloat) -> CGRect {
        return CGRect(x: x, y: y, width: width, height: height)
    }

    public func with(height: CGFloat) -> CGRect {
        return CGRect(x: x, y: y, width: width, height: height)
    }

    public func with(origin: CGPoint) -> CGRect {
        return CGRect(origin: origin, size: size)
    }

    public func with(size: CGSize) -> CGRect {
        return CGRect(origin: origin, size: size)
    }

}
