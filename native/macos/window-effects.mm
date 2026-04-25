#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

static NSString *const kElectrobunVibrancyViewIdentifier =
	@"ElectrobunVibrancyView";
static NSString *const kElectrobunNativeDragViewIdentifier =
	@"ElectrobunNativeDragView";
static const CGFloat kDefaultSidebarVibrancyWidth = 280.0;
static const NSTimeInterval kMoveRefreshInterval = 1.0 / 60.0;
static const NSTimeInterval kMoveRefreshStopDelay = 0.25;
static char kElectrobunWindowEffectsObserverKey;

@interface ElectrobunNativeDragView : NSView
@end

@interface ElectrobunVibrancyView : NSVisualEffectView
@end

@interface ElectrobunWindowEffectsObserver : NSObject
@property(nonatomic, weak) NSWindow *window;
@property(nonatomic, strong) NSTimer *moveRefreshTimer;
@property(nonatomic, strong) NSTimer *moveRefreshStopTimer;
- (instancetype)initWithWindow:(NSWindow *)window;
- (void)invalidate;
@end

static bool refreshWindowVibrancyForWindow(NSWindow *window);

@implementation ElectrobunVibrancyView
- (NSView *)hitTest:(NSPoint)point {
	(void)point;
	return nil;
}
@end

@implementation ElectrobunNativeDragView
- (BOOL)isOpaque {
	return NO;
}

- (void)drawRect:(NSRect)dirtyRect {
	(void)dirtyRect;
}

- (void)mouseDown:(NSEvent *)event {
	NSWindow *window = [self window];
	if (window != nil && event != nil) {
		[window performWindowDragWithEvent:event];
	}
}
@end

@implementation ElectrobunWindowEffectsObserver
- (instancetype)initWithWindow:(NSWindow *)window {
	self = [super init];
	if (self != nil) {
		_window = window;
		NSNotificationCenter *center = [NSNotificationCenter defaultCenter];
		[center addObserver:self
				   selector:@selector(windowWillMove:)
					   name:NSWindowWillMoveNotification
					 object:window];
		[center addObserver:self
				   selector:@selector(windowDidMove:)
					   name:NSWindowDidMoveNotification
					 object:window];
		[center addObserver:self
				   selector:@selector(windowDidResize:)
					   name:NSWindowDidResizeNotification
					 object:window];
	}

	return self;
}

- (void)dealloc {
	[self invalidate];
}

- (void)invalidate {
	[[NSNotificationCenter defaultCenter] removeObserver:self];
	[self stopMoveRefreshTimer];
	[self.moveRefreshStopTimer invalidate];
	self.moveRefreshStopTimer = nil;
}

- (void)windowWillMove:(NSNotification *)notification {
	(void)notification;
	[self startMoveRefreshTimer];
}

- (void)windowDidMove:(NSNotification *)notification {
	(void)notification;
	refreshWindowVibrancyForWindow(self.window);
	[self scheduleMoveRefreshStop];
}

- (void)windowDidResize:(NSNotification *)notification {
	(void)notification;
	refreshWindowVibrancyForWindow(self.window);
}

- (void)refreshVibrancyWhileMoving:(NSTimer *)timer {
	(void)timer;
	refreshWindowVibrancyForWindow(self.window);
}

- (void)startMoveRefreshTimer {
	[self.moveRefreshStopTimer invalidate];
	self.moveRefreshStopTimer = nil;

	if (self.moveRefreshTimer != nil) {
		return;
	}

	NSTimer *timer = [NSTimer timerWithTimeInterval:kMoveRefreshInterval
											target:self
										  selector:@selector(refreshVibrancyWhileMoving:)
										  userInfo:nil
										   repeats:YES];
	[[NSRunLoop mainRunLoop] addTimer:timer forMode:NSRunLoopCommonModes];
	[[NSRunLoop mainRunLoop] addTimer:timer forMode:NSEventTrackingRunLoopMode];
	self.moveRefreshTimer = timer;
}

- (void)scheduleMoveRefreshStop {
	[self.moveRefreshStopTimer invalidate];
	self.moveRefreshStopTimer =
		[NSTimer scheduledTimerWithTimeInterval:kMoveRefreshStopDelay
										 target:self
									   selector:@selector(stopMoveRefreshTimerFromTimer:)
									   userInfo:nil
										repeats:NO];
}

- (void)stopMoveRefreshTimerFromTimer:(NSTimer *)timer {
	(void)timer;
	[self stopMoveRefreshTimer];
	self.moveRefreshStopTimer = nil;
}

- (void)stopMoveRefreshTimer {
	[self.moveRefreshTimer invalidate];
	self.moveRefreshTimer = nil;
}
@end

static NSVisualEffectView *findVibrancyView(NSView *contentView) {
	for (NSView *subview in [contentView subviews]) {
		if ([subview isKindOfClass:[ElectrobunVibrancyView class]] &&
			[[subview identifier]
				isEqualToString:kElectrobunVibrancyViewIdentifier]) {
			return (NSVisualEffectView *)subview;
		}
	}

	return nil;
}

static void configureVibrancyView(NSVisualEffectView *effectView) {
	if (@available(macOS 10.14, *)) {
		[effectView setMaterial:NSVisualEffectMaterialHUDWindow];
	} else {
		[effectView setMaterial:NSVisualEffectMaterialSidebar];
	}
	[effectView setBlendingMode:NSVisualEffectBlendingModeBehindWindow];
	[effectView setState:NSVisualEffectStateActive];
	[effectView setAlphaValue:0.16];
}

static void ensureWindowEffectsObserver(NSWindow *window) {
	if (window == nil) {
		return;
	}

	ElectrobunWindowEffectsObserver *observer =
		(ElectrobunWindowEffectsObserver *)objc_getAssociatedObject(
			window, &kElectrobunWindowEffectsObserverKey);
	if (observer != nil) {
		return;
	}

	observer = [[ElectrobunWindowEffectsObserver alloc] initWithWindow:window];
	objc_setAssociatedObject(window, &kElectrobunWindowEffectsObserverKey,
							 observer, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
}

static void setSidebarVibrancyFrame(NSVisualEffectView *effectView,
									NSView *contentView,
									double sidebarWidth) {
	CGFloat width = MAX(0.0, sidebarWidth);
	CGFloat height = contentView.bounds.size.height;
	[effectView setFrame:NSMakeRect(0.0, 0.0, width, height)];
}

static void pulseSidebarVibrancyGeometry(NSVisualEffectView *effectView) {
	NSRect frame = effectView.frame;
	if (frame.size.width <= 1.0 || frame.size.height <= 1.0) {
		return;
	}

	NSRect pulseFrame = frame;
	pulseFrame.size.width = MAX(1.0, frame.size.width - 0.5);
	[effectView setFrame:pulseFrame];
	[effectView setFrame:frame];
}

static ElectrobunNativeDragView *findNativeDragView(NSView *contentView) {
	for (NSView *subview in [contentView subviews]) {
		if ([subview isKindOfClass:[ElectrobunNativeDragView class]] &&
			[[subview identifier]
				isEqualToString:kElectrobunNativeDragViewIdentifier]) {
			return (ElectrobunNativeDragView *)subview;
		}
	}

	return nil;
}

extern "C" bool enableWindowVibrancy(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		[window setOpaque:NO];
		[window setBackgroundColor:[NSColor clearColor]];
		[window setTitlebarAppearsTransparent:YES];
		[window setHasShadow:YES];

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		NSVisualEffectView *effectView = findVibrancyView(contentView);

		if (effectView == nil) {
			effectView = [[ElectrobunVibrancyView alloc] initWithFrame:NSZeroRect];
			[effectView setIdentifier:kElectrobunVibrancyViewIdentifier];
			[effectView
				setAutoresizingMask:NSViewHeightSizable];
		}

		setSidebarVibrancyFrame(effectView, contentView,
								kDefaultSidebarVibrancyWidth);
		configureVibrancyView(effectView);

		if ([effectView superview] == nil) {
			[contentView addSubview:effectView
						 positioned:NSWindowAbove
						 relativeTo:nil];
		}

		[effectView setNeedsDisplay:YES];
		[effectView displayIfNeeded];
		[window invalidateShadow];
		ensureWindowEffectsObserver(window);
		success = YES;
	});

	return success;
}

static bool refreshWindowVibrancyForWindow(NSWindow *window) {
	if (window == nil) {
		return false;
	}

	if (![window isKindOfClass:[NSWindow class]]) {
		return false;
	}

	NSView *contentView = [window contentView];
	if (contentView == nil) {
		return false;
	}

	NSVisualEffectView *effectView = findVibrancyView(contentView);
	if (effectView == nil) {
		return false;
	}

	setSidebarVibrancyFrame(effectView, contentView, effectView.frame.size.width);
	pulseSidebarVibrancyGeometry(effectView);
	configureVibrancyView(effectView);
	[effectView setNeedsDisplay:YES];
	[effectView displayIfNeeded];
	[contentView setNeedsDisplay:YES];
	[contentView displayIfNeeded];
	[window invalidateShadow];
	return true;
}

extern "C" bool refreshWindowVibrancy(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		success = refreshWindowVibrancyForWindow((__bridge NSWindow *)windowPtr);
	});

	return success;
}

extern "C" bool setSidebarVibrancyWidth(void *windowPtr, double sidebarWidth) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		NSVisualEffectView *effectView = findVibrancyView(contentView);
		if (effectView == nil) {
			return;
		}

		setSidebarVibrancyFrame(effectView, contentView, sidebarWidth);
		[effectView setNeedsDisplay:YES];
		[effectView displayIfNeeded];
		success = YES;
	});

	return success;
}

extern "C" bool ensureWindowShadow(void *windowPtr) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		[window setHasShadow:YES];
		[window invalidateShadow];
		success = YES;
	});

	return success;
}

extern "C" bool setWindowTrafficLightsPosition(void *windowPtr, double x,
											   double yFromTop) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		NSButton *closeButton =
			[window standardWindowButton:NSWindowCloseButton];
		NSButton *minimizeButton =
			[window standardWindowButton:NSWindowMiniaturizeButton];
		NSButton *zoomButton = [window standardWindowButton:NSWindowZoomButton];

		if (closeButton == nil || minimizeButton == nil || zoomButton == nil) {
			return;
		}

		NSView *buttonContainer = [closeButton superview];
		if (buttonContainer == nil) {
			return;
		}

		CGFloat spacing = NSMinX(minimizeButton.frame) - NSMinX(closeButton.frame);
		if (spacing <= 0) {
			spacing = closeButton.frame.size.width + 6.0;
		}

		BOOL flipped = [buttonContainer isFlipped];
		CGFloat targetY = yFromTop;
		if (!flipped) {
			targetY = buttonContainer.frame.size.height - yFromTop -
					  closeButton.frame.size.height;
		}
		targetY = MAX(0.0, targetY);

		CGFloat currentX = x;
		NSArray<NSButton *> *buttons = @[ closeButton, minimizeButton, zoomButton ];
		for (NSButton *button in buttons) {
			[button setFrameOrigin:NSMakePoint(currentX, targetY)];
			currentX += spacing;
		}

		[buttonContainer setNeedsLayout:YES];
		[buttonContainer layoutSubtreeIfNeeded];
		[window invalidateShadow];
		success = YES;
	});

	return success;
}

extern "C" bool setNativeWindowDragRegion(void *windowPtr, double x,
										  double yFromTop, double width,
										  double height) {
	if (windowPtr == nullptr) {
		return false;
	}

	__block BOOL success = NO;
	dispatch_sync(dispatch_get_main_queue(), ^{
		NSWindow *window = (__bridge NSWindow *)windowPtr;
		if (![window isKindOfClass:[NSWindow class]]) {
			return;
		}

		NSView *contentView = [window contentView];
		if (contentView == nil) {
			return;
		}

		CGFloat dragX = MIN(MAX(0.0, x), contentView.bounds.size.width);
		CGFloat dragYFromTop = MAX(0.0, yFromTop);
		CGFloat dragHeight = MAX(0.0, height);
		CGFloat availableWidth = MAX(0.0, contentView.bounds.size.width - dragX);
		CGFloat dragWidth = width > 0.0 ? MIN(width, availableWidth) : availableWidth;
		if (dragHeight <= 0.0 || dragWidth <= 0.0) {
			return;
		}

		BOOL flipped = [contentView isFlipped];
		CGFloat dragY =
			flipped ? dragYFromTop
					: contentView.bounds.size.height - dragYFromTop - dragHeight;
		dragY = MAX(0.0, dragY);

		ElectrobunNativeDragView *dragView = findNativeDragView(contentView);
		if (dragView == nil) {
			dragView = [[ElectrobunNativeDragView alloc] initWithFrame:NSZeroRect];
			[dragView setIdentifier:kElectrobunNativeDragViewIdentifier];
		}

		[dragView setFrame:NSMakeRect(dragX, dragY, dragWidth, dragHeight)];
		[dragView setAutoresizingMask:NSViewNotSizable];

		if ([dragView superview] == nil) {
			[contentView addSubview:dragView
						 positioned:NSWindowAbove
						 relativeTo:nil];
		}

		success = YES;
	});

	return success;
}
