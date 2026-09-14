/*
 * Template: JavaCompute node with the correct message lifecycle.
 *
 * The try/finally around clearMessage() is not stylistic. Without it the
 * broker-side message tree is never released -- the Java object is collected,
 * the native tree is not -- and the DataFlowEngine process grows until AIX
 * kills it.
 */
package com.acme.order;

import com.ibm.broker.javacompute.MbJavaComputeNode;
import com.ibm.broker.plugin.MbElement;
import com.ibm.broker.plugin.MbException;
import com.ibm.broker.plugin.MbMessage;
import com.ibm.broker.plugin.MbMessageAssembly;
import com.ibm.broker.plugin.MbOutputTerminal;
import com.ibm.broker.plugin.MbUserException;

public class BuildOrderRequest extends MbJavaComputeNode {

    private static final String MSG_CATALOG = "ACMEmsgs";
    private static final String ERR_KEY     = "3001";

    /* Configuration read once, from BAR-overridable node attributes.
     * Instance fields are shared across threads, so treat them as immutable
     * after onInitialize() and never store per-message state here. */
    private String targetSystem;

    @Override
    public void onInitialize() throws MbException {
        Object uda = getUserDefinedAttribute("targetSystem");
        this.targetSystem = (uda == null) ? "" : uda.toString();
    }

    @Override
    public void evaluate(MbMessageAssembly inAssembly) throws MbException {
        MbOutputTerminal out      = getOutputTerminal("out");
        MbMessage        inMsg    = inAssembly.getMessage();
        MbMessage        outMsg   = new MbMessage(inMsg);
        MbMessageAssembly outAsm  = new MbMessageAssembly(inAssembly, outMsg);

        String orderId = "";

        try {
            MbElement inBody = inMsg.getRootElement().getLastChild();
            MbElement idEl   = inBody.getFirstElementByPath("/Order/Id");
            if (idEl == null) {
                throw new MbUserException(this, "evaluate()", MSG_CATALOG, ERR_KEY,
                        "Mandatory element /Order/Id is absent",
                        new Object[] { targetSystem });
            }
            orderId = idEl.getValueAsString();

            MbElement outBody = outMsg.getRootElement().getLastChild();
            outBody.createElementAsLastChild(MbElement.TYPE_NAME_VALUE,
                    "TargetSystem", targetSystem);

            out.propagate(outAsm);

        } catch (MbException e) {
            /* Already carries broker context (node, terminal, message number).
             * Rethrowing unchanged keeps the Failure terminal path intact. */
            throw e;

        } catch (RuntimeException e) {
            /* Never swallow. A logged-and-returned exception means the broker
             * believes the message was processed and it is gone. */
            throw new MbUserException(this, "evaluate()", MSG_CATALOG, ERR_KEY,
                    e.toString(), new Object[] { orderId, targetSystem });

        } finally {
            outMsg.clearMessage();
        }
    }
}
