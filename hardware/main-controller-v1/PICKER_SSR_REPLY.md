**Subject:** Re: Picker PCS4-5D-240A-2-Z-T — sampling, lead time, and channel questions

Hi Stephanie,

Thanks for the reply and for sending over the REACH / RoHS documentation. I haven't received any samples yet — this is the first look I've had at the PCS4 series, and I'd like to move forward with sampling so I can lock in the footprint and driver circuit for my next PCB revision.

**A few questions before I place the sample request:**

1. **Sample quantity and cost.** What's the standard sample quantity you can send, and is there a cost or is it complimentary at low volume? I'd like enough to populate 1–2 test boards (12 relays per board), so ideally 24–30 pcs if that's within what "samples" covers. If not, please let me know what a small paid quantity looks like.

2. **Sample lead time.** You mentioned 4–5 weeks for samples versus 18–20 weeks for production. Is the 4–5 weeks from order confirmation, or from receipt of PO? And is that shipping FOB your dock, or delivered?

3. **Lead time on production.** The 18–20 weeks is longer than I expected — is that a current supply-chain condition or the long-term norm for this series? For planning purposes, I want to understand whether that's likely to shorten meaningfully in the next 6–12 months.

4. **MOQ for direct orders.** For a first production run, my volumes will be small — likely 100–500 pcs to start, scaling from there. Given you don't have stocking distributors on this series, what MOQ would we be looking at for direct-from-Picker orders? And are there price breaks I should be aware of at 100 / 500 / 1,000 pcs?

5. **Contract manufacturer channel.** You mentioned Picker can work with contract manufacturers. I'm currently using JLCPCB (Shenzhen) for turnkey PCBA. Would Picker be willing to ship parts directly to a JLCPCB warehouse address on my behalf, or is the more typical arrangement to have me consign the parts to JLC after receiving them at my address? I want to understand what workflow you've supported before.

6. **Is there a different Picker SSR that's available now?** This is my most important question. The 18–20 week production lead time on the PCS4-5D is a hard constraint for me — I need to get boards into hand for design validation in the next 6–8 weeks. Is there another Picker series or part number (SIP, PCB-mount, ~24VAC solenoid switching duty, ideally 5VDC control and zero-cross) that Picker either **stocks internally**, has **shorter lead time on**, or that a **stocking distributor already carries**? I'm flexible on:
    - Package (SIP-4, DIP, SOP — anything PCB-mountable is fair game)
    - Pin pitch and pinout (I haven't cut the rev2 PCB yet, so the footprint isn't locked)
    - Control voltage (3.3V, 5V, or 12V — I can adapt the driver circuit)
    - Contact rating (anything 1A+ at 24VAC works for my solenoid loads)
    
    The PCS4-5D was my first pick based on datasheet fit, but I'd happily redesign around a Picker part with better near-term availability. If you can suggest 2–3 alternates I should look at, I'll evaluate them against my design constraints and come back with a decision quickly.

7. **Application context.** For your records: I'm designing a 12-zone smart irrigation controller. Each SSR switches a 24VAC solenoid valve (~250 mA holding, ~500 mA inrush). Volume estimate is 100 units in the first production run, with a target of 1,000–5,000 units within 18 months once retail launch is qualified. Happy to share more detail if it helps you scope the opportunity on your side.

Thanks again — I'm eager to get a Picker part on the rev2 board, but I want to make sure we're sampling the right one given your lead-time picture. Happy to jump on a short call if that'd be faster than email for questions 5–6.

Best,
Mitch Christensen
Azul Devices
