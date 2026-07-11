export default function Template6({ personal, declarationDate }) {
  return (
    <div className="print-page">
      <style>{`
        .t6 *{box-sizing:border-box}
        .t6{width:210mm;min-height:297mm;margin:20px auto;background:#fff;border:3px solid #222;position:relative;padding:10px;font-family:"Times New Roman",serif;page-break-after:always}
        .t6 .inner{border:1px solid #222;min-height:287mm;padding:10px 26px 90px}
        .t6 h1{margin:0;text-align:center;font-size:30px}
        .t6 .red{height:3px;background:#7d2c2c;margin:8px 20px}
        .t6 .sub{text-align:center;font-size:12px}
        .t6 .title{text-align:center;color:#29446f;font-size:22px;font-weight:bold;margin:70px 0 45px}
        .t6 p{font-size:13px;line-height:1.55;text-align:justify;margin:0}
        .t6 .line{display:inline-block;border-bottom:1px solid #000;min-width:305px;height:16px;vertical-align:bottom;padding-left:4px}
        .t6 .line2{display:inline-block;border-bottom:1px solid #000;min-width:170px;height:16px;vertical-align:bottom;padding-left:4px}
        .t6 .body{font-size:18px;line-height:1.6}
        .t6 .signs{display:flex;justify-content:space-between;margin-top:120px;padding:0 10px}
        .t6 .sig{width:260px}
        .t6 .sigline{border-bottom:2px solid #222;height:25px}
        .t6 .lbl{font-weight:bold;font-size:14px;margin-top:3px}
        .t6 .footer{border-top:2px solid #8d3535;padding-top:6px;text-align:center;font-size:11px;margin-top:12px}
      `}</style>
      <div className="t6">
        <div className="inner">
          <h1>Being Sevak Charitable Trust</h1>
          <div className="red"></div>
          <div className="sub">Public Charitable Trust (Reg.) E-31948 No, Income Tax Exempted Under 80G</div>

          <div className="title">VOLUNTEER APPOINTMENT LETTER</div>

          <div className="body">
            <p>Dear <span className="line">{personal.fullName || ''}</span>,</p>
            <br /><br />
            <p>We are delighted to inform you that you have been appointed as a volunteer from the date of <span className="line2">{declarationDate || ''}</span> at the Being Sevak Charitable Trust. Your dedication to trust work and voluntary service is highly commendable, and we are grateful for your commitment to our cause. In recognition of your valuable contributions, we are pleased to provide you Volunteer and Program expenses, if any, for your contribution towards our Trust. Your involvement will significantly contribute to the success of our initiatives and the betterment of our community. Thank you for your willingness to serve and for being an integral part of our team — we look forward to working together to make a positive impact.</p>
            <br /><br /><br />
            <p>Warm regards,</p>
            <br />
            <p>Being Sevak Charitable Trust.</p>
          </div>

          <div className="signs">
            <div className="sig">
              <div className="sigline"></div>
              <div className="lbl">Name of the Volunteer — {personal.fullName || ''}</div>
            </div>
            <div className="sig">
              <div className="sigline"></div>
              <div className="lbl">Signature of the Volunteer</div>
            </div>
          </div>
        </div>
        <div className="footer">
          Reg. Add.: Office No. 402, 4th Floor, 'A' Wing, New Delite Apartment, Near Chandavarkar Lane, Borivali (West), Mumbai.<br />
          Contact Sevak: 8879035035 / 8879034034 | E-Mail: being.sevak@gmail.com | Website: www.beingsevak.org
        </div>
      </div>
    </div>
  );
}
